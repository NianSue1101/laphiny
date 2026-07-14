import { DEFAULT_CONTEXT_LIMIT, MAX_DELEGATION_DEPTH } from '../config/app_config';
import { useRef } from 'react';

import {
  buildChatHistory,
  buildChatHistoryForDelegation,
  buildChatHistoryForSequentialTurn,
} from '../app/chat_history';
import {
  getErrorMessage,
  isAbortError,
  makeAssistantPlaceholder,
  makeId,
  makeLocalNotice,
} from '../app/app_utils';
import type { ScheduledReply } from '../app/app_types';
import { beginBackgroundAgentTask } from '../lib/background_agent';
import { buildGoalReviewPrompt, parseGoalCommand } from '../lib/goal_mode';
import { getActiveGoalLeadMember, getGoalControlCommand, makeGoalSession } from '../lib/goal_session';
import { getSendTargets, type SendTargetSelection } from '../lib/chat_targets';
import { resolveAssistantDelegations } from '../lib/mentions';
import { stripRoomStatePatchBlocks } from '../lib/room_growth';
import { getRoleplayTargets, isRoleplayUserTurn, makeDefaultRoleplayConfig, parseRoleplayCommand } from '../lib/roleplay';
import { makeDefaultRoleplayArchive } from '../lib/stage4_plus';
import { runHermesMemberCompletion } from '../lib/chat_runtime';
import type { Attachment, ChatMessage, RoleplayConfig, Room, RoomMember } from '../types';

const MAX_GOAL_REVIEW_ROUNDS = 3;
const MAX_GOAL_DELEGATIONS_PER_ROUND = 3;

export function useChatDispatchRuntime(options: any) {
  // Requests to the same Soul preserve order; different members remain concurrent.
  const memberQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
  const {
    appendCollaborationEvent,
    appendDiagnosticLog,
    appendMessagesToRoom,
    applyAgentRoomStatePatch,
    applyAlwaysPermissionIfNeeded,
    applyGoalAssistantResult,
    cleanupStream,
    connectionById,
    connections,
    continueAgentAfterPermission,
    createDelegationTask,
    delayedGoalMessageIdsRef,
    finishActiveGoal,
    flushStreamMessage,
    generateRitualConsensus,
    messagesByRoom,
    notifyAgentReplyFinished,
    queueStreamMessageUpdate,
    registerStreamController,
    selectedTargetIds,
    setDraft,
    setPendingAttachments,
    setSelectedTargetIds,
    setStreamActive,
    showRoomReplyNotification,
    updateDelegationTask,
    updateMessageInRoom,
    updateRoomById,
  } = options;
  function resolveSendTargets(room: Room, rawText: string, explicitTargetIds = selectedTargetIds): SendTargetSelection {
    return getSendTargets({ room, rawText, explicitTargetIds, connections });
  }
  async function streamHermesReply({
    room,
    member,
    placeholderId,
    text,
    attachments,
    previousMessages,
  }: {
    room: Room;
    member: RoomMember;
    placeholderId: string;
    text: string;
    attachments: Attachment[];
    previousMessages: ChatMessage[];
  }) {
    const connection = connectionById.get(member.connectionId);
    if (!connection) {
      updateMessageInRoom(room.id, placeholderId, { status: 'error', error: 'Hermes 连接不存在', content: '发送失败' });
      return;
    }

    const controller = new AbortController();
    registerStreamController(placeholderId, controller);
    setStreamActive(placeholderId, true);
    const releaseBackgroundAgentTask = await beginBackgroundAgentTask();

    let streamedText = '';
    updateMessageInRoom(room.id, placeholderId, { content: '', status: 'running', error: undefined });

    try {
      const reply = await runHermesMemberCompletion({
        connection,
        messages: buildChatHistory(previousMessages, room, member, text, attachments, connections, room.contextLimit ?? DEFAULT_CONTEXT_LIMIT),
        sessionId: room.sessionIds[connection.id],
        sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
        timeoutMs: 120_000,
        signal: controller.signal,
        onProgress: (progress) => queueStreamMessageUpdate(room.id, placeholderId, progress),
      });
      streamedText = reply.rawText;

      flushStreamMessage(room.id, placeholderId);
      const permissionRequest = applyAlwaysPermissionIfNeeded(reply.permissionRequest);
      const answer = permissionRequest ? reply.content || permissionRequest.body : reply.content;
      const completedMessage: ChatMessage = {
        id: placeholderId,
        roomId: room.id,
        role: 'assistant',
        authorId: member.connectionId,
        authorName: member.alias,
        content: answer,
        attachments: reply.attachments.length ? reply.attachments : undefined,
        reasoning: reply.reasoning,
        permissionRequest,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      updateMessageInRoom(room.id, placeholderId, {
        content: answer,
        attachments: reply.attachments.length ? reply.attachments : undefined,
        reasoning: reply.reasoning,
        permissionRequest,
        status: 'sent',
      });
      if (permissionRequest?.status === 'always') {
        void continueAgentAfterPermission(room, member, completedMessage, 'always');
      }
    } catch (error) {
      flushStreamMessage(room.id, placeholderId);
      if (isAbortError(error)) {
        updateMessageInRoom(room.id, placeholderId, {
          content: streamedText.trim() || '已停止生成',
          status: 'stopped',
        });
        return;
      }

      updateMessageInRoom(room.id, placeholderId, {
        status: 'error',
        error: getErrorMessage(error),
        content: streamedText.trim() || '发送失败',
      });
    } finally {
      cleanupStream(placeholderId);
      await releaseBackgroundAgentTask();
    }
  }

  async function dispatchMessage(room: Room, rawText: string, attachments: Attachment[], explicitTargetIds = selectedTargetIds) {
    if (!rawText && attachments.length === 0) {
      return;
    }

    const previousMessages = messagesByRoom[room.id] ?? [];
    const now = new Date().toISOString();
    const parsedRoleplayCommand = room.kind === 'group' ? parseRoleplayCommand(rawText) : null;

    if (parsedRoleplayCommand?.kind === 'stop') {
      const userMessage: ChatMessage = {
        id: makeId('msg'),
        roomId: room.id,
        role: 'user',
        authorId: 'user',
        authorName: '你',
        content: rawText,
        attachments,
        status: 'sent',
        createdAt: now,
      };
      appendMessagesToRoom(room.id, [userMessage, makeLocalNotice(room.id, '桌游店 RP 模式已关闭。群聊恢复普通协作触发规则。')]);
      updateRoomById(room.id, { roleplay: { ...(room.roleplay ?? makeDefaultRoleplayConfig()), enabled: false, updatedAt: now } });
      appendCollaborationEvent({
        kind: 'roleplay_updated',
        roomId: room.id,
        roomName: room.name,
        source: '用户',
        messageId: userMessage.id,
        title: 'RP 模式已关闭',
        body: rawText,
      });
      setDraft('');
      setPendingAttachments([]);
      return;
    }

    let effectiveRoom = room;
    if (room.kind === 'group' && parsedRoleplayCommand) {
      const gm = getRoleplayTargets(room)[0] ?? room.members.find((member) => member.enabled);
      const base = room.roleplay ?? makeDefaultRoleplayConfig(gm?.connectionId);
      const nextRoleplay: RoleplayConfig = {
        ...base,
        enabled: true,
        gmConnectionId: base.gmConnectionId ?? gm?.connectionId,
        premise: parsedRoleplayCommand.kind === 'start' && parsedRoleplayCommand.topic ? parsedRoleplayCommand.topic : base.premise,
        currentScene: parsedRoleplayCommand.kind === 'scene' && parsedRoleplayCommand.topic ? parsedRoleplayCommand.topic : base.currentScene,
        archive: base.archive ?? makeDefaultRoleplayArchive(room.name, base),
        updatedAt: now,
      };
      effectiveRoom = { ...room, roleplay: nextRoleplay, mode: 'tabletop', defaultCollaborationMode: 'manual' };
      updateRoomById(room.id, { roleplay: nextRoleplay, mode: 'tabletop', defaultCollaborationMode: 'manual' });
    }

    const startsNewGoal = Boolean(parseGoalCommand(rawText));
    const goalControl = getGoalControlCommand(effectiveRoom, rawText);
    if (goalControl?.type === 'finish') {
      const userMessage: ChatMessage = {
        id: makeId('msg'),
        roomId: room.id,
        role: 'user',
        authorId: 'user',
        authorName: '你',
        content: rawText,
        attachments,
        status: 'sent',
        createdAt: now,
      };
      setDraft('');
      setPendingAttachments([]);
      setSelectedTargetIds([]);
      appendMessagesToRoom(room.id, [userMessage, makeLocalNotice(room.id, '目标已结束，并已沉淀到房间记忆。')]);
      finishActiveGoal(effectiveRoom, 'finish');
      return;
    }

    let sendSelection = resolveSendTargets(effectiveRoom, rawText, explicitTargetIds);
    if (goalControl?.type === 'continue' && effectiveRoom.activeGoal) {
      const leadMember = getActiveGoalLeadMember(effectiveRoom);
      if (leadMember) {
        sendSelection = {
          targets: [leadMember],
          textForHermes: buildGoalReviewPrompt({
            goal: effectiveRoom.activeGoal.goal,
            room: effectiveRoom,
            leadMember,
            connections,
            round: effectiveRoom.activeGoal.round + 1,
          }),
          mode: 'sequential',
          goalMode: { id: 'goal', goal: effectiveRoom.activeGoal.goal },
        };
        updateRoomById(room.id, {
          activeGoal: {
            ...effectiveRoom.activeGoal,
            status: 'reviewing',
            statusSignal: undefined,
            round: effectiveRoom.activeGoal.round + 1,
            userDecision: 'continue',
            updatedAt: now,
          },
        });
      }
    }

    const { targets, textForHermes, mode, ritual, goalMode } = sendSelection;
    const goalLeadMember = goalMode ? targets[0] : undefined;
    const userMessage: ChatMessage = {
      id: makeId('msg'),
      roomId: room.id,
      role: 'user',
      authorId: 'user',
      authorName: '你',
      content: rawText || '[附件]',
      attachments,
      status: 'sent',
      createdAt: now,
    };

    setDraft('');
    setPendingAttachments([]);
    setSelectedTargetIds([]);
    appendMessagesToRoom(room.id, [userMessage]);
    let activeGoalForTurn = effectiveRoom.activeGoal;
    if (startsNewGoal && goalMode && goalLeadMember) {
      const activeGoal = makeGoalSession(room.id, goalMode.goal, goalLeadMember, now, userMessage.id);
      activeGoalForTurn = activeGoal;
      updateRoomById(room.id, { activeGoal });
    }
    const roleplayTurn = effectiveRoom.kind === 'group' && effectiveRoom.roleplay?.enabled && targets.length > 0 && mode === 'sequential' && isRoleplayUserTurn(effectiveRoom, rawText);
    appendCollaborationEvent({
      kind: ritual ? 'ritual_started' : roleplayTurn ? 'roleplay_updated' : 'user_message',
      roomId: room.id,
      roomName: room.name,
      source: '用户',
      messageId: userMessage.id,
      title: ritual ? `启动${ritual.definition.label}` : roleplayTurn ? '玩家推进 RP 回合' : '用户发起协作轮次',
      body: rawText || '[附件]',
    });

    if (targets.length === 0) {
      const errorText = room.kind === 'group'
        ? '请选择本次回复成员，或使用 @成员名 / @all / @all-seq / 协作仪式命令，或开启 RP 模式后输入角色行动。'
        : '这个房间没有可用的 Hermes 成员。';
      appendMessagesToRoom(room.id, [makeLocalNotice(room.id, errorText)]);
      appendDiagnosticLog({
        level: 'warning',
        category: 'chat',
        title: '消息未发送给 Hermes',
        message: errorText,
        roomId: room.id,
        roomName: room.name,
        meta: { kind: room.kind },
      });
      return;
    }

    const releaseBackgroundAgentTurn = await beginBackgroundAgentTask();
    try {
    const turnMessages: ChatMessage[] = [...previousMessages, userMessage];
    const dispatchRoom = activeGoalForTurn ? { ...effectiveRoom, activeGoal: activeGoalForTurn } : effectiveRoom;
    const scheduledKeys = new Set<string>();
    const scheduledPromises: Promise<void>[] = [];
    let goalDelegationCount = 0;
    let reviewedGoalDelegationCount = 0;
    let goalReviewRound = 0;
    let lastGoalTerminalMessage: ChatMessage | null = null;

    const scheduleReply = (reply: ScheduledReply): Promise<void> | null => {
      const normalizedTask = reply.text.trim().replace(/\s+/g, ' ').slice(0, 160);
      const key = [
        reply.delegatedFromConnectionId ?? 'user',
        reply.member.connectionId,
        reply.depth,
        normalizedTask,
      ].join('::');
      if (scheduledKeys.has(key)) return null;
      scheduledKeys.add(key);

      const memberQueueKey = `${room.id}:${reply.member.connectionId}`;
      const previousForMember = memberQueuesRef.current.get(memberQueueKey) ?? Promise.resolve();
      const taskPromise = previousForMember.then(() => runReply(reply));
      const queued = taskPromise.catch(() => {});
      memberQueuesRef.current.set(memberQueueKey, queued);
      void queued.finally(() => {
        if (memberQueuesRef.current.get(memberQueueKey) === queued) {
          memberQueuesRef.current.delete(memberQueueKey);
        }
      });
      scheduledPromises.push(taskPromise);
      return taskPromise;
    };

    const runReply = async (reply: ScheduledReply) => {
      const placeholder = makeAssistantPlaceholder(dispatchRoom.id, reply.member);
      if (reply.delegatedFrom) {
        placeholder.delegatedFrom = reply.delegatedFrom;
      }
      if (reply.goalMode) {
        delayedGoalMessageIdsRef.current.add(placeholder.id);
      }
      appendMessagesToRoom(room.id, [placeholder]);

      const connection = connectionById.get(reply.member.connectionId);
      if (!connection) {
        updateMessageInRoom(room.id, placeholder.id, { status: 'error', error: 'Hermes 连接不存在', content: '发送失败' });
        appendDiagnosticLog({
          level: 'error',
          category: 'chat',
          title: 'Hermes 回复失败',
          message: 'Hermes 连接不存在',
          roomId: room.id,
          roomName: room.name,
          connectionId: reply.member.connectionId,
          connectionName: reply.member.alias,
        });
        return;
      }

      const controller = new AbortController();
      registerStreamController(placeholder.id, controller);
      setStreamActive(placeholder.id, true);
      const releaseBackgroundAgentTask = await beginBackgroundAgentTask();
      updateMessageInRoom(room.id, placeholder.id, { status: 'running', content: '', error: undefined });
      const requestId = makeId('req');
      const startedAt = Date.now();
      let promptMessagesCount = 0;
      let accumulated = '';

      if (reply.taskId) {
        updateDelegationTask(reply.taskId, { status: 'running' });
        appendCollaborationEvent({
          kind: 'delegation_started',
          roomId: room.id,
          roomName: room.name,
          source: reply.delegatedFrom,
          target: reply.member.alias,
          taskId: reply.taskId,
          messageId: placeholder.id,
          title: `${reply.member.alias} 开始处理委托`,
          body: reply.text,
        });
      } else {
        appendCollaborationEvent({
          kind: 'agent_reply_started',
          roomId: room.id,
          roomName: room.name,
          target: reply.member.alias,
          messageId: placeholder.id,
          title: `${reply.member.alias} 开始回复`,
          body: reply.text,
        });
      }

      try {
        const hasEarlierTurnReply = mode === 'sequential' && turnMessages.some((message) => (
          message.role === 'assistant' && message.status === 'sent' && message.authorId !== 'system'
        ));
        const historyMessages = reply.delegatedFrom
          ? buildChatHistoryForDelegation(
              [...turnMessages],
              dispatchRoom,
              reply.member,
              reply.text,
              reply.delegatedFrom,
              reply.delegatorMessage ?? reply.text,
              connections,
              room.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
            )
          : hasEarlierTurnReply
            ? buildChatHistoryForSequentialTurn(
                [...turnMessages],
                dispatchRoom,
                reply.member,
                reply.text,
                reply.attachments,
                connections,
                room.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
              )
            : buildChatHistory(
                previousMessages,
                dispatchRoom,
                reply.member,
                reply.text,
                reply.attachments,
                connections,
                room.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
              );

        promptMessagesCount = historyMessages.length;
        appendDiagnosticLog({
          level: 'info',
          category: 'chat',
          title: reply.delegatedFrom ? '委托请求开始' : 'Hermes 请求开始',
          message: `${reply.member.alias} 正在处理${reply.delegatedFrom ? ` ${reply.delegatedFrom} 的委托` : '用户消息'}。`,
          roomId: room.id,
          roomName: room.name,
          connectionId: connection.id,
          connectionName: reply.member.alias,
          requestId,
          meta: { mode, depth: reply.depth, attachments: reply.attachments.length, promptMessages: promptMessagesCount },
        });

        const replyResult = await runHermesMemberCompletion({
          connection,
          messages: historyMessages,
          sessionId: room.sessionIds[connection.id],
          sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
          timeoutMs: reply.goalMode ? 240_000 : 180_000,
          signal: controller.signal,
          onProgress: (progress) => queueStreamMessageUpdate(room.id, placeholder.id, progress),
        });
        accumulated = replyResult.rawText;

        flushStreamMessage(room.id, placeholder.id);
        const permissionRequest = applyAlwaysPermissionIfNeeded(replyResult.permissionRequest);
        const rawAnswer = permissionRequest ? replyResult.content || permissionRequest.body : replyResult.content;
        const answer = stripRoomStatePatchBlocks(rawAnswer) || rawAnswer;
        const completedMessage: ChatMessage = {
          ...placeholder,
          content: answer,
          attachments: replyResult.attachments.length ? replyResult.attachments : undefined,
          reasoning: replyResult.reasoning,
          permissionRequest,
          status: 'sent',
        };
        if (reply.goalMode) {
          lastGoalTerminalMessage = completedMessage;
        }
        turnMessages.push(completedMessage);
        updateMessageInRoom(room.id, placeholder.id, {
          content: answer,
          attachments: completedMessage.attachments,
          reasoning: completedMessage.reasoning,
          permissionRequest,
          status: 'sent',
        });
        if (permissionRequest?.status !== 'pending') {
          applyAgentRoomStatePatch(room.id, reply.member.alias, rawAnswer, completedMessage.id);
          applyGoalAssistantResult(dispatchRoom, reply, completedMessage, answer);
        }
        if (permissionRequest?.status === 'always') {
          void continueAgentAfterPermission(room, reply.member, completedMessage, 'always');
        }
        appendDiagnosticLog({
          level: 'success',
          category: 'chat',
          title: reply.delegatedFrom ? '委托请求完成' : 'Hermes 请求完成',
          message: `${reply.member.alias} 返回 ${answer.length} 字。`,
          roomId: room.id,
          roomName: room.name,
          connectionId: connection.id,
          connectionName: reply.member.alias,
          requestId,
          durationMs: Date.now() - startedAt,
          meta: { mode, depth: reply.depth, chars: answer.length, promptMessages: promptMessagesCount },
        });
        if (reply.taskId) {
          updateDelegationTask(reply.taskId, { status: 'done', resultMessageId: completedMessage.id });
          appendCollaborationEvent({
            kind: 'delegation_completed',
            roomId: room.id,
            roomName: room.name,
            source: reply.delegatedFrom,
            target: reply.member.alias,
            taskId: reply.taskId,
            messageId: completedMessage.id,
            title: `${reply.member.alias} 完成委托`,
            body: answer,
          });
        } else {
          appendCollaborationEvent({
            kind: 'agent_reply_completed',
            roomId: room.id,
            roomName: room.name,
            target: reply.member.alias,
            messageId: completedMessage.id,
            title: `${reply.member.alias} 完成回复`,
            body: answer,
          });
        }

        if (room.kind === 'group' && room.autoDelegationEnabled !== false && reply.depth < (room.maxDelegationDepth ?? MAX_DELEGATION_DEPTH)) {
          const delegations = resolveAssistantDelegations(room, answer, reply.member.connectionId);
          const acceptedDelegations = reply.goalMode ? delegations.slice(0, MAX_GOAL_DELEGATIONS_PER_ROUND) : delegations;
          if (reply.goalMode && delegations.length > acceptedDelegations.length) {
            appendMessagesToRoom(room.id, [
              makeLocalNotice(room.id, `目标模式本轮最多接收 ${MAX_GOAL_DELEGATIONS_PER_ROUND} 个委托，已忽略 ${delegations.length - acceptedDelegations.length} 个额外委托。`),
            ]);
          }
          for (const delegation of acceptedDelegations) {
            const taskText = delegation.taskText || '请根据上一条回复和群聊上下文继续处理这个委托任务。';
            appendDiagnosticLog({
              level: 'info',
              category: 'chat',
              title: 'Agent 委托已排队',
              message: `${reply.member.alias} → ${delegation.target.alias}: ${taskText.slice(0, 120)}`,
              roomId: room.id,
              roomName: room.name,
              connectionId: delegation.target.connectionId,
              connectionName: delegation.target.alias,
              requestId,
              meta: { depth: reply.depth + 1 },
            });
            const task = createDelegationTask({
              roomId: room.id,
              roomName: room.name,
              fromConnectionId: reply.member.connectionId,
              fromAlias: reply.member.alias,
              toConnectionId: delegation.target.connectionId,
              toAlias: delegation.target.alias,
              taskText,
              depth: reply.depth + 1,
              sourceMessageId: completedMessage.id,
            });
            if (goalMode) {
              goalDelegationCount += 1;
            }
            scheduleReply({
              member: delegation.target,
              text: taskText,
              attachments: [],
              depth: reply.depth + 1,
              delegatedFrom: reply.member.alias,
              delegatedFromConnectionId: reply.member.connectionId,
              delegatorMessage: answer,
              taskId: task.id,
              goalMode: reply.goalMode,
            });
          }
        }
      } catch (error) {
        flushStreamMessage(room.id, placeholder.id);
        if (isAbortError(error)) {
          const stoppedContent = accumulated.trim() || '已停止生成';
          const stoppedMessage: ChatMessage = {
            ...placeholder,
            content: stoppedContent,
            status: 'stopped',
          };
          if (reply.goalMode) {
            lastGoalTerminalMessage = stoppedMessage;
          }
          turnMessages.push(stoppedMessage);
          updateMessageInRoom(room.id, placeholder.id, {
            content: stoppedContent,
            status: 'stopped',
          });
          updateDelegationTask(reply.taskId, { status: 'cancelled', resultMessageId: stoppedMessage.id });
          appendDiagnosticLog({
            level: 'warning',
            category: 'chat',
            title: 'Hermes 请求已停止',
            message: `${reply.member.alias} 的回复被手动停止。`,
            roomId: room.id,
            roomName: room.name,
            connectionId: connection.id,
            connectionName: reply.member.alias,
            requestId,
            durationMs: Date.now() - startedAt,
          });
          return;
        }

        updateDelegationTask(reply.taskId, { status: 'error', error: getErrorMessage(error), resultMessageId: placeholder.id });
        updateMessageInRoom(room.id, placeholder.id, {
          status: 'error',
          error: getErrorMessage(error),
          content: reply.delegatedFrom ? '转发失败' : '发送失败',
        });
        appendDiagnosticLog({
          level: 'error',
          category: 'chat',
          title: reply.delegatedFrom ? '委托请求失败' : 'Hermes 请求失败',
          message: getErrorMessage(error),
          roomId: room.id,
          roomName: room.name,
          connectionId: connection.id,
          connectionName: reply.member.alias,
          requestId,
          durationMs: Date.now() - startedAt,
          meta: { mode, depth: reply.depth, promptMessages: promptMessagesCount },
        });
      } finally {
        cleanupStream(placeholder.id);
        await releaseBackgroundAgentTask();
      }
    };

    if (mode === 'sequential') {
      for (const member of targets) {
        const task = scheduleReply({ member, text: textForHermes, attachments, depth: 0, goalMode });
        if (task) await task;
      }
    } else {
      for (const member of targets) {
        scheduleReply({ member, text: textForHermes, attachments, depth: 0, goalMode });
      }
    }

    let cursor = 0;
    while (cursor < scheduledPromises.length) {
      const batch = scheduledPromises.slice(cursor);
      cursor = scheduledPromises.length;
      await Promise.allSettled(batch);
      if (
        goalMode
        && goalLeadMember
        && cursor >= scheduledPromises.length
        && goalDelegationCount > reviewedGoalDelegationCount
        && goalReviewRound < MAX_GOAL_REVIEW_ROUNDS
      ) {
        reviewedGoalDelegationCount = goalDelegationCount;
        goalReviewRound += 1;
        scheduleReply({
          member: goalLeadMember,
          text: buildGoalReviewPrompt({ goal: goalMode.goal, room: dispatchRoom, leadMember: goalLeadMember, connections, round: goalReviewRound }),
          attachments: [],
          depth: goalReviewRound,
          goalMode,
          goalReviewRound,
        });
      }
    }

    if (ritual?.definition.autoConsensus) {
      await generateRitualConsensus(dispatchRoom, ritual, turnMessages);
    }
    const terminalGoalMessage = lastGoalTerminalMessage as ChatMessage | null;
    if (goalMode && terminalGoalMessage && !terminalGoalMessage.permissionRequest) {
      showRoomReplyNotification(room.id, terminalGoalMessage);
      void notifyAgentReplyFinished(room.id, terminalGoalMessage, 'goal');
      for (const message of turnMessages) {
        delayedGoalMessageIdsRef.current.delete(message.id);
      }
    }
    } finally {
      await releaseBackgroundAgentTurn();
    }
  }

  return {
    dispatchMessage,
    streamHermesReply,
  };
}
