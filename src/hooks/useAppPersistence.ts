import { useEffect, type MutableRefObject } from 'react';

import { getErrorMessage, showNotice } from '../app/app_utils';
import { describeStorageBackend } from '../storage/kv';
import { normalizeDelegationTasksAfterHydration } from '../lib/delegation_tasks';
import {
  loadAppPreferences,
  loadConnections,
  loadCollaborationEvents,
  loadDelegationTasks,
  loadDiagnosticLogs,
  loadFeedbackConfig,
  loadProfileVersions,
  loadMessages,
  loadRooms,
  loadTeamTemplates,
  loadSquareEvents,
  loadSyncConfig,
  saveAppPreferences,
  saveConnections,
  saveCollaborationEvents,
  saveDelegationTasks,
  saveDiagnosticLogs,
  saveFeedbackConfig,
  saveProfileVersions,
  saveMessages,
  saveRooms,
  saveTeamTemplates,
  saveSquareEvents,
  saveSyncConfig,
} from '../storage/repository';

type UseAppPersistenceOptions = {
  hydratedRef: MutableRefObject<boolean>;
  saveMessagesTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  cleanupAllStreams: () => void;
  replaceDiagnosticLogs: (value: unknown) => void;
  setHydrated: (value: boolean) => void;
  setConnections: any;
  setRooms: any;
  setMessagesByRoom: any;
  setSyncConfig: any;
  setAppPreferences: any;
  setFeedbackConfig: any;
  setSquareEvents: any;
  setCollaborationEvents: any;
  setDelegationTasks: any;
  setTeamTemplates: any;
  setProfileVersions: any;
  setStorageBackend: any;
  setSelectedRoomId: any;
  connections: unknown;
  rooms: unknown;
  messagesByRoom: unknown;
  syncConfig: unknown;
  appPreferences: unknown;
  feedbackConfig: unknown;
  squareEvents: unknown;
  diagnosticLogs: unknown;
  collaborationEvents: unknown;
  delegationTasks: unknown;
  teamTemplates: unknown;
  profileVersions: unknown;
};

export function useAppPersistence({
  hydratedRef,
  saveMessagesTimerRef,
  cleanupAllStreams,
  replaceDiagnosticLogs,
  setHydrated,
  setConnections,
  setRooms,
  setMessagesByRoom,
  setSyncConfig,
  setAppPreferences,
  setFeedbackConfig,
  setSquareEvents,
  setCollaborationEvents,
  setDelegationTasks,
  setTeamTemplates,
  setProfileVersions,
  setStorageBackend,
  setSelectedRoomId,
  connections,
  rooms,
  messagesByRoom,
  syncConfig,
  appPreferences,
  feedbackConfig,
  squareEvents,
  diagnosticLogs,
  collaborationEvents,
  delegationTasks,
  teamTemplates,
  profileVersions,
}: UseAppPersistenceOptions) {
  useEffect(() => {
    let mounted = true;

    Promise.all([
      loadConnections(),
      loadRooms(),
      loadMessages(),
      loadSyncConfig(),
      loadAppPreferences(),
      loadFeedbackConfig(),
      loadSquareEvents(),
      loadDiagnosticLogs(),
      loadCollaborationEvents(),
      loadDelegationTasks(),
      loadTeamTemplates(),
      loadProfileVersions(),
      describeStorageBackend(),
    ])
      .then(([
        loadedConnections,
        loadedRooms,
        loadedMessages,
        loadedSyncConfig,
        loadedAppPreferences,
        loadedFeedbackConfig,
        loadedSquareEvents,
        loadedDiagnosticLogs,
        loadedCollaborationEvents,
        loadedDelegationTasks,
        loadedTeamTemplates,
        loadedProfileVersions,
        loadedStorageBackend,
      ]) => {
        if (!mounted) return;
        setConnections(loadedConnections);
        setRooms(loadedRooms);
        setMessagesByRoom(loadedMessages);
        setSyncConfig(loadedSyncConfig);
        setAppPreferences(loadedAppPreferences);
        setFeedbackConfig(loadedFeedbackConfig);
        setSquareEvents(loadedSquareEvents);
        replaceDiagnosticLogs(loadedDiagnosticLogs);
        setCollaborationEvents(loadedCollaborationEvents.slice(-500));
        setDelegationTasks(normalizeDelegationTasksAfterHydration(loadedDelegationTasks, new Date().toISOString()).slice(-200));
        setTeamTemplates(loadedTeamTemplates);
        setProfileVersions(loadedProfileVersions.slice(-100));
        setStorageBackend(loadedStorageBackend);
        setSelectedRoomId(loadedRooms[0]?.id ?? null);
        hydratedRef.current = true;
        setHydrated(true);
      })
      .catch((error) => {
        showNotice('加载本地数据失败', getErrorMessage(error));
        hydratedRef.current = true;
        setHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (hydratedRef.current) void saveConnections(connections as any);
  }, [connections]);

  useEffect(() => {
    if (hydratedRef.current) void saveRooms(rooms as any);
  }, [rooms]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveMessagesTimerRef.current) {
      clearTimeout(saveMessagesTimerRef.current);
    }
    saveMessagesTimerRef.current = setTimeout(() => {
      saveMessagesTimerRef.current = null;
      void saveMessages(messagesByRoom as any);
    }, 350);
  }, [messagesByRoom]);

  useEffect(() => {
    if (hydratedRef.current) void saveSyncConfig(syncConfig as any);
  }, [syncConfig]);

  useEffect(() => {
    if (hydratedRef.current) void saveAppPreferences(appPreferences as any);
  }, [appPreferences]);

  useEffect(() => {
    if (hydratedRef.current) void saveFeedbackConfig(feedbackConfig as any);
  }, [feedbackConfig]);

  useEffect(() => {
    if (hydratedRef.current) void saveSquareEvents(squareEvents as any);
  }, [squareEvents]);

  useEffect(() => {
    if (hydratedRef.current) void saveDiagnosticLogs(diagnosticLogs as any);
  }, [diagnosticLogs]);

  useEffect(() => {
    if (hydratedRef.current) void saveCollaborationEvents(collaborationEvents as any);
  }, [collaborationEvents]);

  useEffect(() => {
    if (hydratedRef.current) void saveDelegationTasks(delegationTasks as any);
  }, [delegationTasks]);

  useEffect(() => {
    if (hydratedRef.current) void saveTeamTemplates(teamTemplates as any);
  }, [teamTemplates]);

  useEffect(() => {
    if (hydratedRef.current) void saveProfileVersions(profileVersions as any);
  }, [profileVersions]);

  useEffect(() => {
    return () => {
      if (saveMessagesTimerRef.current) {
        clearTimeout(saveMessagesTimerRef.current);
      }
      cleanupAllStreams();
    };
  }, []);
}
