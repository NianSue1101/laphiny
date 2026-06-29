import type { ComponentType } from 'react';
import { ScrollView, View, type TextProps } from 'react-native';

import type { Room } from '../types';
import type { TaskBoardColumn } from '../lib/stage4_plus';

interface TaskBoardPanelProps {
  room: Room | null;
  columns: TaskBoardColumn[];
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
}

export function TaskBoardPanel({ room, columns, styles, TextComponent: Text }: TaskBoardPanelProps) {
  if (!room || room.kind !== 'group') return null;

  return (
    <View style={styles.roomEditPanel}>
      <Text style={styles.panelLabel}>任务看板</Text>
      <Text style={styles.help}>委托任务会按状态进入看板。专业协作里是项目任务；RP 房间里也可作为主线/支线任务。</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskBoardRow}>
        {columns.map((column) => (
          <View key={column.id} style={styles.taskBoardColumn}>
            <Text style={styles.taskBoardTitle}>{column.label} · {column.tasks.length}</Text>
            {column.tasks.slice(0, 5).map((task) => (
              <View key={task.id} style={styles.taskBoardItem}>
                <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias}</Text>
                <Text style={styles.help} numberOfLines={3}>{task.taskText}</Text>
              </View>
            ))}
            {column.tasks.length === 0 ? <Text style={styles.help}>暂无</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
