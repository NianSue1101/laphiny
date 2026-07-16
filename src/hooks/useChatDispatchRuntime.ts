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
import { AgentTaskScheduler } from '../lib/agent_scheduler';
import { buildGoalReviewPrompt, parseGoalCommand, parseGoalPlanItems, parseGoalStatusSignal } from '../lib/goal_mode';
import { getActiveGoalLeadMember, getGoalControlCommand, makeGoalSession, mergeGoalPlanItems } from '../lib/goal_session';
import { isGoalCompletionSupported, makeGoalProgressFingerprint } from '../lib/goal_state_machine';
import { getSendTargets, type SendTargetSelection } from '../lib/chat_targets';
import { resolveAssistantDelegations, resolveAssistantToolDelegations } from '../lib/mentions';
import { stripRoomStatePatchBlocks } from '../lib/room_growth';
import { getRoleplayTargets, isRoleplayUserTurn, makeDefaultRoleplayConfig, parseRoleplayCommand } from '../lib/roleplay';
import { makeDefaultRoleplayArchive } from '../lib/stage4_plus';
import { runHermesMemberCompletion } from '../lib/chat_runtime';
import { HermesTransportError } from '../lib/hermes_client';
import type { Attachment, ChatMessage, RoleplayConfig, Room, RoomMember } from '../types';

const MAX_GOAL_REVIEW_ROUNDS = 5;
const MAX_GOAL_DELEGATIONS_PER_ROUND = 3;

export function useChatDispatchRuntime(options: any) {
  // Requests to the same Soul preserve order; different members remain concurrent.
  const localSchedulerRef = useRef(new AgentTaskScheduler());
  const schedulerRef = options.schedulerRef ?? localSchedulerRef;
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
    beginDelegationTaskAttempt,
    delayedGoalMessageIdsRef,
    finishActiveGoal,
    flushStreamMessage,
    generateRitualConsensus,
    markStreamPhase,
    messagesByRoom,
    rooms,
    notifyAgentReplyFinished,
    pauseActiveGoal,
    queueStreamMessageUpdate,
    registerStreamController,
    selectedTargetIds,
    setDraft,
    setPendingAttachments,
    setSelectedTargetIds,
    setStreamActive,
    startStream,
    showRoomReplyNotification,
    updateDelegationTask,
    transitionDelegationTaskAttempt,
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
    delegationTaskId,
    delegationAttemptId,
    delegatedFrom,
  }: {
    room: Room;
    member: RoomMember;
    placeholderId: string;
    text: string;
    attachments: Attachment[];
    previousMessages: ChatMessage[];
    delegationTaskId?: string;
    delegationAttemptId?: string;
    delegatedFrom?: string;
  }) {
    startStream(placeholderId, room.id, member.connectionId);
    const connection = connectionById.get(member.connectionId);
    if (!connection) {
      markStreamPhase(placeholderId, 'failed', 'Hermes 连接不存在');
      updateMessageInRoom(room.id, placeholderId, { status: 'error', error: 'Hermes 连接不存在', content: '发送失败' });
      transitionTask(delegationTaskId, delegationAttemptId, { status: 'error', error: 'Hermes 连接不存在', resultMessageId: placeholderId });
      cleanupStream(placeholderId);
      return;
    }

    const controller = new AbortController();
    registerStreamController(placeholderId, controller);
    setStreamActive(placeholderId, true);
    markStreamPhase(placeholderId, 'connecting');
    transitionTask(delegationTaskId, delegationAttemptId, { status: 'running' });
    const releaseBackgroundAgentTask = await beginBackgroundAgentTask();

    let streamedText = '';
    updateMessageInRoom(room.id, placeholderId, { content: '', status: 'running', error: undefined });

    try {
      const reply = await runHermesMemberCompletion({
        connection,
        messages: delegatedFrom
          ? buildChatHistoryForDelegation(previousMessages, room, member, text, delegatedFrom, text, connections, room.contextLimit ?? DEFAULT_CONTEXT_LIMIT)
          : buildChatHistory(previousMessages, room, member, text, attachments, connections, room.contextLimit ?? DEFAULT_CONTEXT_LIMIT),
        sessionId: room.sessionIds[connection.id],
        sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
        timeoutMs: 120_000,
        signal: controller.signal,
        onProgress: (progress) => {
          streamedText = progress.content;
          queueStreamMessageUpdate(room.id, placeholderId, progress);
        },
      });
      streamedText = reply.rawText;

      flushStreamMessage(room.id, placeholderId);
      const permissionRequest = applyAlwaysPermissionIfNeeded(member.connectionId, reply.permissionRequest);
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
        activityNotices: reply.activityNotices,
        delegationTaskId,
        delegationAttemptId,
        permissionRequest,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      updateMessageInRoom(room.id, placeholderId, {
        content: answer,
        attachments: reply.attachments.length ? reply.attachments : undefined,
        reasoning: reply.reasoning,
        activityNotices: reply.activityNotices,
        delegationTaskId,
        delegationAttemptId,
        permissionRequest,
        status: 'sent',
      });
      markStreamPhase(placeholderId, 'completed');
      if (delegationTaskId && permissionRequest?.status === 'pending') {
        transitionTask(delegationTaskId, delegationAttemptId, {
          status: 'waiting_permission',
          resultMessageId: placeholderId,
          error: '等待用户确认 Agent 权限',
        });
      } else if (delegationTaskId) {
        transitionTask(delegationTaskId, delegationAttemptId, {
          status: 'done',
          resultMessageId: placeholderId,
          evidence: [answer.replace(/\s+/gu, ' ').trim().slice(0, 500)],
        });
      }
      if (permissionRequest?.status === 'always') {
        void continueAgentAfterPermission(room, member, completedMessage, 'always');
      }
    } catch (error) {
      flushStreamMessage(room.id, placeholderId);
      if (isAbortError(error)) {
        markStreamPhase(placeholderId, 'cancelled');
        updateMessageInRoom(room.id, placeholderId, {
          content: streamedText.trim() || '已停止生成',
          status: 'stopped',
        });
        transitionTask(delegationTaskId, delegationAttemptId, { status: 'cancelled', resultMessageId: placeholderId });
        return;
      }

      const errorMessage = getErrorMessage(error);
      markStreamPhase(placeholderId, 'failed', errorMessage);
      updateMessageInRoom(room.id, placeholderId, {
        status: 'error',
        error: errorMessage,
        content: streamedText.trim() || '发送失败',
      });
      transitionTask(delegationTaskId, delegationAttemptId, {
        status: error instanceof HermesTransportError && streamedText.trim() ? 'outcome_unknown' : 'error',
        error: errorMessage,
        resultMessageId: placeholderId,
      });
    } finally {
      cleanupStream(placeholderId);
      await releaseBackgroundAgentTask();
    }
  }

  function transitionTask(
    taskId: string | undefined,
    attemptId: string | undefined,
    patch: { status: string; resultMessageId?: string; error?: string; evidence?: string[] },
  ) {
    if (attemptId) {
      transitionDelegationTaskAttempt(taskId, attemptId, patch);
      return;
    }
    updateDelegationTask(taskId, patch);
  }

  async function dispatchMessage(
    room: Room,
    rawText: string,
    attachments: Attachment[],
    explicitTargetIds = selectedTargetIds,
    retryOfMessageId?: string,
  ) {
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

    const { targets, textForHermes, mode, ritual, goalMode, ambiguity } = sendSelection;
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
      retryOfMessageId,
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
      const errorText = ambiguity
        ? `@${ambiguity.mention} 对应多个成员（${ambiguity.candidateConnectionIds.join('、')}），请改用唯一 connection id。`
        : room.kind === 'group'
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
    let goalReviewRound = activeGoalForTurn?.round ?? 1;
    let lastGoalTerminalMessage: ChatMessage | null = null;
    let lastGoalSignal: 'done' | 'continue' | 'blocked' | null = null;
    let goalShouldContinue = false;
    let goalPausedBySafety = false;
    let goalPlanItems = activeGoalForTurn?.planItems ?? [];
    let goalProgressFingerprint = '';
    let goalNoProgressRounds = 0;

    const scheduleReply = (reply: ScheduledReply): Promise<void> | null => {
      const normalizedTask = reply.text.trim().replace(/\s+/g, ' ');
      const key = [
        reply.delegatedFromConnectionId ?? 'user',
        reply.member.connectionId,
        reply.depth,
        normalizedTask,
      ].join('::');
      if (scheduledKeys.has(key)) return null;
      scheduledKeys.add(key);

      const taskPromise = schedulerRef.current.schedule({
        roomId: room.id,
        connectionId: reply.member.connectionId,
      }, () => runReply(reply));
      scheduledPromises.push(taskPromise);
      return taskPromise;
    };

    const runReply = async (reply: ScheduledReply) => {
      const placeholder = makeAssistantPlaceholder(dispatchRoom.id, reply.member);
      placeholder.retryOfMessageId = reply.retryOfMessageId;
      if (reply.delegatedFrom) {
        placeholder.delegatedFrom = reply.delegatedFrom;
      }
      if (reply.goalMode) {
        delayedGoalMessageIdsRef.current.add(placeholder.id);
      }
      appendMessagesToRoom(room.id, [placeholder]);
      startStream(placeholder.id, room.id, reply.member.connectionId);

      const connection = connectionById.get(reply.member.connectionId);
      if (!connection) {
        markStreamPhase(placeholder.id, 'failed', 'Hermes 连接不存在');
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
        transitionTask(reply.taskId, reply.delegationAttemptId, { status: 'error', error: 'Hermes 连接不存在', resultMessageId: placeholder.id });
        cleanupStream(placeholder.id);
        return;
      }

      const controller = new AbortController();
      registerStreamController(placeholder.id, controller);
      setStreamActive(placeholder.id, true);
      markStreamPhase(placeholder.id, 'connecting');
      const releaseBackgroundAgentTask = await beginBackgroundAgentTask();
      updateMessageInRoom(room.id, placeholder.id, { status: 'running', content: '', error: undefined });
      const requestId = makeId('req');
      const startedAt = Date.now();
      let promptMessagesCount = 0;
      let accumulated = '';

      if (reply.taskId) {
        transitionTask(reply.taskId, reply.delegationAttemptId, { status: 'running' });
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
          // New/imported connections may not have been probed yet. Try the
          // structured endpoint optimistically; chat_runtime falls back only
          // for explicit Responses compatibility failures. A recorded
          // unsupported capability remains authoritative until re-tested.
          useToolDelegation: room.agentToolDelegationEnabled !== false && connection.toolDelegation?.supported !== false,
          onProgress: (progress) => {
            accumulated = progress.content;
            queueStreamMessageUpdate(room.id, placeholder.id, progress);
          },
        });
        accumulated = replyResult.rawText;

        flushStreamMessage(room.id, placeholder.id);
        const permissionRequest = applyAlwaysPermissionIfNeeded(reply.member.connectionId, replyResult.permissionRequest);
        const rawAnswer = permissionRequest ? replyResult.content || permissionRequest.body : replyResult.content;
        const answer = stripRoomStatePatchBlocks(rawAnswer) || rawAnswer;
        const completedMessage: ChatMessage = {
          ...placeholder,
          content: answer,
          attachments: replyResult.attachments.length ? replyResult.attachments : undefined,
          reasoning: replyResult.reasoning,
          activityNotices: replyResult.activityNotices,
          delegationTaskId: reply.taskId,
          delegationAttemptId: reply.delegationAttemptId,
          permissionRequest,
          status: 'sent',
        };
        if (reply.goalMode && reply.member.connectionId === goalLeadMember?.connectionId) {
          lastGoalTerminalMessage = completedMessage;
          const reportedSignal = parseGoalStatusSignal(answer);
          const parsedPlanItems = parseGoalPlanItems(answer, dispatchRoom, new Date().toISOString());
          if (parsedPlanItems.length) goalPlanItems = mergeGoalPlanItems(goalPlanItems, parsedPlanItems);
          const completionSupported = reportedSignal === 'done' && isGoalCompletionSupported(goalPlanItems);
          lastGoalSignal = reportedSignal === 'done' && !completionSupported ? 'continue' : reportedSignal;
          goalShouldContinue = lastGoalSignal === 'continue' || lastGoalSignal === null;
          const nextFingerprint = makeGoalProgressFingerprint(goalPlanItems, []);
          goalNoProgressRounds = nextFingerprint === goalProgressFingerprint ? goalNoProgressRounds + 1 : 0;
          goalProgressFingerprint = nextFingerprint;
          goalPausedBySafety = goalNoProgressRounds >= 2;
        }
        turnMessages.push(completedMessage);
        updateMessageInRoom(room.id, placeholder.id, {
          content: answer,
          attachments: completedMessage.attachments,
          reasoning: completedMessage.reasoning,
          activityNotices: completedMessage.activityNotices,
          delegationTaskId: completedMessage.delegationTaskId,
          delegationAttemptId: completedMessage.delegationAttemptId,
          permissionRequest,
          status: 'sent',
        });
        if (permissionRequest?.status !== 'pending') {
          if (reply.goalMode && reply.member.connectionId === goalLeadMember?.connectionId) {
            markStreamPhase(placeholder.id, 'reviewing');
          }
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
        if (reply.taskId && permissionRequest?.status === 'pending') {
          transitionTask(reply.taskId, reply.delegationAttemptId, {
            status: 'waiting_permission',
            resultMessageId: completedMessage.id,
            error: '等待用户确认 Agent 权限',
          });
        } else if (reply.taskId) {
          transitionTask(reply.taskId, reply.delegationAttemptId, {
            status: 'done',
            resultMessageId: completedMessage.id,
            evidence: [answer.replace(/\s+/gu, ' ').trim().slice(0, 500)],
          });
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
          const hasDelegationToolCall = room.agentToolDelegationEnabled !== false
            && Boolean(replyResult.toolCalls?.some((call) => call.name === 'laphiny_delegate_tasks'));
          const toolDelegations = room.agentToolDelegationEnabled !== false
            ? resolveAssistantToolDelegations(room, replyResult.toolCalls, reply.member.connectionId)
            : [];
          const delegations = hasDelegationToolCall
            ? toolDelegations
            : resolveAssistantDelegations(room, answer, reply.member.connectionId);
          if (hasDelegationToolCall && toolDelegations.length === 0) {
            appendMessagesToRoom(room.id, [makeLocalNotice(room.id, `${reply.member.alias} 提交的工具委托无有效任务，已拒绝且不会回退解析正文中的 @ 示例。`)]);
          }
          const delegationLimit = reply.goalMode ? MAX_GOAL_DELEGATIONS_PER_ROUND : 1;
          const acceptedDelegations = delegations.slice(0, delegationLimit);
          if (delegations.length > acceptedDelegations.length) {
            appendMessagesToRoom(room.id, [
              makeLocalNotice(room.id, `${reply.goalMode ? '目标模式' : '普通模式'}本轮最多接收 ${delegationLimit} 个委托，已忽略 ${delegations.length - acceptedDelegations.length} 个额外委托。`),
            ]);
          }
          for (const delegation of acceptedDelegations) {
            markStreamPhase(placeholder.id, 'delegating');
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
              goalId: activeGoalForTurn?.id,
              planItemId: goalPlanItems.find((item) => (
                item.ownerConnectionId === delegation.target.connectionId
                && item.status !== 'done'
              ))?.id,
              input: delegation.input ?? taskText,
              deliverable: delegation.deliverable ?? goalPlanItems.find((item) => item.ownerConnectionId === delegation.target.connectionId)?.deliverable,
              acceptance: delegation.acceptance ?? goalPlanItems.find((item) => item.ownerConnectionId === delegation.target.connectionId)?.acceptance,
              priority: delegation.priority,
              attempts: 0,
              evidence: [],
            });
            if (goalMode) {
              goalDelegationCount += 1;
            }
            const scheduled = scheduleReply({
              member: delegation.target,
              text: taskText,
              attachments: [],
              depth: reply.depth + 1,
              delegatedFrom: reply.member.alias,
              delegatedFromConnectionId: reply.member.connectionId,
              delegatorMessage: answer,
              taskId: task.id,
              delegationAttemptId: task.currentAttemptId,
              goalMode: reply.goalMode,
            });
            if (!scheduled) {
              updateDelegationTask(task.id, { status: 'cancelled', error: '重复委托已忽略' });
            }
          }
        }
        markStreamPhase(placeholder.id, 'completed');
      } catch (error) {
        flushStreamMessage(room.id, placeholder.id);
        if (isAbortError(error)) {
          markStreamPhase(placeholder.id, 'cancelled');
          const stoppedContent = accumulated.trim() || '已停止生成';
          const stoppedMessage: ChatMessage = {
            ...placeholder,
            content: stoppedContent,
            status: 'stopped',
          };
          if (reply.goalMode && reply.member.connectionId === goalLeadMember?.connectionId) {
            lastGoalTerminalMessage = stoppedMessage;
            goalPausedBySafety = true;
            pauseActiveGoal(room.id, '主 Agent 的生成被取消。', stoppedMessage.id);
          }
          turnMessages.push(stoppedMessage);
          updateMessageInRoom(room.id, placeholder.id, {
            content: stoppedContent,
            status: 'stopped',
          });
          transitionTask(reply.taskId, reply.delegationAttemptId, { status: 'cancelled', resultMessageId: stoppedMessage.id });
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

        const errorMessage = getErrorMessage(error);
        markStreamPhase(placeholder.id, 'failed', errorMessage);
        if (reply.goalMode && reply.member.connectionId === goalLeadMember?.connectionId) {
          lastGoalTerminalMessage = {
            ...placeholder,
            status: 'error',
            error: errorMessage,
            content: reply.delegatedFrom ? '转发失败' : '发送失败',
          };
          goalPausedBySafety = true;
          pauseActiveGoal(room.id, `主 Agent 执行失败：${errorMessage}`, placeholder.id);
        }
        transitionTask(reply.taskId, reply.delegationAttemptId, {
          status: error instanceof HermesTransportError && accumulated.trim() ? 'outcome_unknown' : 'error',
          error: errorMessage,
          resultMessageId: placeholder.id,
        });
        updateMessageInRoom(room.id, placeholder.id, {
          status: 'error',
          error: errorMessage,
          content: reply.delegatedFrom ? '转发失败' : '发送失败',
        });
        appendDiagnosticLog({
          level: 'error',
          category: 'chat',
          title: reply.delegatedFrom ? '委托请求失败' : 'Hermes 请求失败',
          message: errorMessage,
          roomId: room.id,
          roomName: room.name,
          connectionId: connection.id,
          connectionName: reply.member.alias,
          requestId,
          durationMs: Date.now() - startedAt,
          meta: {
            mode,
            depth: reply.depth,
            promptMessages: promptMessagesCount,
            errorKind: error instanceof HermesTransportError ? error.kind : 'request_failed',
            receivedChars: accumulated.length,
          },
        });
      } finally {
        cleanupStream(placeholder.id);
        await releaseBackgroundAgentTask();
      }
    };

    if (mode === 'sequential') {
      for (const member of targets) {
        const task = scheduleReply({ member, text: textForHermes, attachments, depth: 0, goalMode, retryOfMessageId });
        if (task) await task;
      }
    } else {
      for (const member of targets) {
        scheduleReply({ member, text: textForHermes, attachments, depth: 0, goalMode, retryOfMessageId });
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
        && (goalDelegationCount > reviewedGoalDelegationCount || goalShouldContinue)
        && lastGoalSignal !== 'done'
        && lastGoalSignal !== 'blocked'
        && !goalPausedBySafety
        && goalReviewRound < MAX_GOAL_REVIEW_ROUNDS
      ) {
        reviewedGoalDelegationCount = goalDelegationCount;
        goalReviewRound += 1;
        goalShouldContinue = false;
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

    if (goalMode && goalShouldContinue && goalReviewRound >= MAX_GOAL_REVIEW_ROUNDS) {
      goalPausedBySafety = true;
      appendMessagesToRoom(room.id, [makeLocalNotice(room.id, `目标已达到 ${MAX_GOAL_REVIEW_ROUNDS} 轮安全上限，等待用户确认是否继续。`)]);
    } else if (goalMode && goalPausedBySafety && lastGoalSignal !== 'done' && lastGoalSignal !== 'blocked') {
      appendMessagesToRoom(room.id, [makeLocalNotice(room.id, '目标连续两轮没有结构化进展，已暂停并等待用户调整。')]);
    }

    if (ritual?.definition.autoConsensus) {
      await generateRitualConsensus(dispatchRoom, ritual, turnMessages);
    }
    const terminalGoalMessage = lastGoalTerminalMessage as ChatMessage | null;
    if (
      goalMode
      && terminalGoalMessage
      && (lastGoalSignal === 'done' || lastGoalSignal === 'blocked' || goalPausedBySafety || terminalGoalMessage.permissionRequest)
    ) {
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

  async function retryDelegationTask(task: import('../types').DelegationTask, targetConnectionId = task.toConnectionId) {
    const room = rooms.find((item: Room) => item.id === task.roomId) as Room | undefined;
    if (!room) throw new Error('委托所属房间不存在');
    const member = room.members.find((item) => item.connectionId === targetConnectionId && item.enabled);
    if (!member) throw new Error('目标 Agent 不在房间中或已禁用');
    const kind = targetConnectionId === task.toConnectionId ? 'retry' as const : 'reassign' as const;
    const operationId = `ui:${kind}:${task.id}:${task.revision ?? 0}:${targetConnectionId}`;
    const result = beginDelegationTaskAttempt(task.id, {
      operationId,
      kind,
      toConnectionId: member.connectionId,
      toAlias: member.alias,
    });
    if (!result.created) return;

    const placeholder = makeAssistantPlaceholder(room.id, member);
    placeholder.delegatedFrom = task.fromAlias;
    placeholder.delegationTaskId = task.id;
    placeholder.delegationAttemptId = result.attempt.id;
    appendMessagesToRoom(room.id, [placeholder]);
    await schedulerRef.current.schedule({ roomId: room.id, connectionId: member.connectionId }, () => streamHermesReply({
      room,
      member,
      placeholderId: placeholder.id,
      text: task.taskText,
      attachments: [],
      previousMessages: messagesByRoom[room.id] ?? [],
      delegationTaskId: task.id,
      delegationAttemptId: result.attempt.id,
      delegatedFrom: task.fromAlias,
    }));
  }

  return {
    dispatchMessage,
    retryDelegationTask,
    streamHermesReply,
  };
}
