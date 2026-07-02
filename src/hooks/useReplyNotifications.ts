import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';

import { normalizeHermesReplyText } from '../lib/hermes_client';
import { buildRoomReplyNotification, type RoomReplyNotification } from '../lib/room_reply_notifications';
import type { Tab } from '../app/app_types';
import type { ChatMessage, GoalSession, Room } from '../types';

const NOTIFICATION_CHANNEL_ID = 'laphiny-agent-replies';

type UseReplyNotificationsOptions = {
  appStateRef: MutableRefObject<AppStateStatus>;
  roomsRef: MutableRefObject<Room[]>;
  selectedRoomIdRef: MutableRefObject<string | null>;
  tabRef: MutableRefObject<Tab>;
  openFocusedChatRoom: (roomId: string) => void;
};

export function useReplyNotifications({
  appStateRef,
  roomsRef,
  selectedRoomIdRef,
  tabRef,
  openFocusedChatRoom,
}: UseReplyNotificationsOptions) {
  const [roomReplyNotification, setRoomReplyNotification] = useState<RoomReplyNotification | null>(null);
  const replyNotificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationsPermissionRef = useRef<'unknown' | 'granted' | 'denied'>('unknown');

  useEffect(() => {
    void prepareAgentNotifications();
    return () => {
      if (replyNotificationTimerRef.current) {
        clearTimeout(replyNotificationTimerRef.current);
      }
    };
  }, []);

  function showRoomReplyNotification(roomId: string, message: ChatMessage) {
    const notification = buildRoomReplyNotification({
      roomId,
      message,
      rooms: roomsRef.current,
      activeRoomId: selectedRoomIdRef.current,
      activeTab: tabRef.current,
    });
    if (!notification) return;
    setRoomReplyNotification(notification);
    if (replyNotificationTimerRef.current) {
      clearTimeout(replyNotificationTimerRef.current);
    }
    replyNotificationTimerRef.current = setTimeout(() => {
      setRoomReplyNotification((current) => (current?.id === notification.id ? null : current));
      replyNotificationTimerRef.current = null;
    }, 8000);
  }

  function openReplyNotification(notification: RoomReplyNotification) {
    openFocusedChatRoom(notification.roomId);
    setRoomReplyNotification(null);
    if (replyNotificationTimerRef.current) {
      clearTimeout(replyNotificationTimerRef.current);
      replyNotificationTimerRef.current = null;
    }
  }

  async function prepareAgentNotifications(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    if (notificationsPermissionRef.current === 'granted') return true;
    if (notificationsPermissionRef.current === 'denied') return false;

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
          name: 'Agent replies',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 180, 80, 180],
          lightColor: '#2563eb',
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      const resolved = existing.granted ? existing : await Notifications.requestPermissionsAsync();
      notificationsPermissionRef.current = resolved.granted ? 'granted' : 'denied';
      return resolved.granted;
    } catch (error) {
      notificationsPermissionRef.current = 'denied';
      console.warn('Failed to prepare local notifications.', error);
      return false;
    }
  }

  async function notifyAgentReplyFinished(roomId: string, message: ChatMessage, mode: 'reply' | 'goal' | 'permission' = 'reply') {
    if (Platform.OS === 'web') return;
    if (message.authorId === 'user' || message.authorId === 'system' || message.status === 'running' || message.status === 'error') return;
    if (appStateRef.current === 'active') return;
    const pendingPermission = message.permissionRequest?.status === 'pending';
    if (message.permissionRequest && !pendingPermission) return;
    const notificationMode = pendingPermission ? 'permission' : mode;

    const ready = await prepareAgentNotifications();
    if (!ready) return;

    const room = roomsRef.current.find((item) => item.id === roomId);
    const roomName = room?.name ?? 'Laphiny';
    const attachmentHint = message.attachments?.length ? ` · ${message.attachments.length} 个附件` : '';
    const preview = normalizeHermesReplyText(message.content).trim().replace(/\s+/g, ' ').slice(0, 120);
    const title = notificationMode === 'permission'
      ? `${roomName} · ${message.authorName} 需要确认`
      : notificationMode === 'goal'
      ? `${roomName} · 目标模式已更新`
      : `${roomName} · ${message.authorName} 已回复`;
    const body = notificationMode === 'permission'
      ? `${message.permissionRequest?.title ?? '权限请求'}：${message.permissionRequest?.body ?? preview}`.slice(0, 180)
      : `${preview || (notificationMode === 'goal' ? '目标模式本轮处理完成' : '新的回复已完成')}${attachmentHint}`;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { roomId, messageId: message.id, mode: notificationMode },
          sound: true,
        },
        trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
      });
    } catch (error) {
      console.warn('Failed to schedule local notification.', error);
    }
  }

  function notifyGoalSessionFinished(room: Room, goal: GoalSession) {
    void notifyAgentReplyFinished(room.id, {
      id: goal.lastMessageId ?? goal.id,
      roomId: room.id,
      role: 'assistant',
      authorId: goal.leadConnectionId,
      authorName: goal.leadAlias,
      content: goal.lastReview || goal.goal,
      status: goal.status === 'blocked' ? 'stopped' : 'sent',
      createdAt: goal.completedAt ?? goal.updatedAt,
    }, 'goal');
  }

  return {
    roomReplyNotification,
    notifyAgentReplyFinished,
    notifyGoalSessionFinished,
    openReplyNotification,
    setRoomReplyNotification,
    showRoomReplyNotification,
  };
}
