import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { listTasks, listEvents, completeTask, type Task, type Event } from '../../src/db/queries';
import { generateRecurringInstances } from '../../src/recurrence/engine';

const PRIORITY_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#f59e0b', 3: '#6b7280' };
const PRIORITY_LABELS: Record<number, string> = { 1: 'HIGH', 2: 'MED', 3: 'LOW' };

function groupByTimePeriod(events: Event[]) {
  const morning: Event[] = [];
  const afternoon: Event[] = [];
  const evening: Event[] = [];
  const allDay: Event[] = [];
  for (const e of events) {
    if (!e.start_datetime.includes('T')) { allDay.push(e); continue; }
    const h = parseISO(e.start_datetime).getHours();
    if (h < 12) morning.push(e);
    else if (h < 17) afternoon.push(e);
    else evening.push(e);
  }
  return { morning, afternoon, evening, allDay };
}

export default function TodayScreen() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await generateRecurringInstances();
    const [t, e] = await Promise.all([
      listTasks({ date: today }),
      listEvents({ start_date: today, end_date: today }),
    ]);
    const allPending = await listTasks({ status: 'pending' });
    const overdue = allPending.filter((task) => task.due_date && task.due_date < today);
    const todayTasks = t.filter((task) => task.status === 'pending');
    const seen = new Set(todayTasks.map((t) => t.id));
    setTasks([...overdue.filter((t) => !seen.has(t.id)), ...todayTasks]);
    setEvents(e);
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleComplete = (task: Task) => {
    Alert.alert('Complete Task', `Mark "${task.title}" as done?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Done', onPress: async () => { await completeTask(task.id); await load(); } },
    ]);
  };

  const overdueCount = tasks.filter((t) => t.due_date && t.due_date < today).length;
  const { morning, afternoon, evening, allDay } = groupByTimePeriod(events);
  const todayTasks = tasks.filter((t) => !t.due_time);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.dateSub}>{format(new Date(), 'EEEE')}</Text>
          <Text style={styles.dateMain}>{format(new Date(), 'MMMM d')}</Text>
        </View>
        <TouchableOpacity style={styles.askBtn} onPress={() => router.push('/(tabs)/chat')}>
          <Ionicons name="sparkles" size={16} color="#fff" />
          <Text style={styles.askBtnText}>Ask AI</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {/* Overdue */}
        {overdueCount > 0 && (
          <>
            <SectionLabel label="Overdue" icon="alert-circle" iconColor="#ef4444" color="#ef4444" />
            {tasks.filter((t) => t.due_date && t.due_date < today).map((t) => (
              <TaskCard key={t.id} task={t} onComplete={handleComplete} overdue />
            ))}
          </>
        )}

        {/* All Day */}
        {allDay.length > 0 && <SectionLabel label="All Day" icon="infinite-outline" />}
        {allDay.map((e) => <EventCard key={e.id} event={e} />)}

        {/* Morning */}
        {morning.length > 0 && <SectionLabel label="Morning" icon="sunny-outline" />}
        {morning.map((e) => <EventCard key={e.id} event={e} />)}

        {/* Afternoon */}
        {afternoon.length > 0 && <SectionLabel label="Afternoon" icon="partly-sunny-outline" />}
        {afternoon.map((e) => <EventCard key={e.id} event={e} />)}

        {/* Evening */}
        {evening.length > 0 && <SectionLabel label="Evening" icon="moon-outline" />}
        {evening.map((e) => <EventCard key={e.id} event={e} />)}

        {/* Tasks */}
        {todayTasks.length > 0 && <SectionLabel label="Tasks" icon="checkmark-circle-outline" />}
        {todayTasks.map((t) => <TaskCard key={t.id} task={t} onComplete={handleComplete} />)}

        {/* Empty */}
        {tasks.length === 0 && events.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="checkmark-done" size={36} color="#6366f1" />
            </View>
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptyText}>Nothing scheduled for today.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/chat')}>
              <Ionicons name="sparkles" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Add with AI</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function SectionLabel({
  label,
  icon,
  color = '#6b7280',
  iconColor,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color?: string;
  iconColor?: string;
}) {
  return (
    <View style={sectionStyles.row}>
      <Ionicons name={icon} size={14} color={iconColor ?? color} />
      <Text style={[sectionStyles.text, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 24, marginBottom: 8, marginHorizontal: 20 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
});

function TaskCard({ task, onComplete, overdue = false }: { task: Task; onComplete: (t: Task) => void; overdue?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.card, overdue && styles.overdueCard]}
      onPress={() => onComplete(task)}
      activeOpacity={0.7}
    >
      <View style={styles.cardLeft}>
        <TouchableOpacity
          style={[styles.checkbox, { borderColor: PRIORITY_COLORS[task.priority] }]}
          onPress={() => onComplete(task)}
        />
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{task.title}</Text>
          {task.description ? <Text style={styles.cardSubtitle} numberOfLines={1}>{task.description}</Text> : null}
          {task.due_time ? (
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={12} color="#9ca3af" />
              <Text style={styles.cardTime}>{task.due_time}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[task.priority] + '18' }]}>
        <Text style={[styles.priorityText, { color: PRIORITY_COLORS[task.priority] }]}>
          {PRIORITY_LABELS[task.priority]}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function EventCard({ event }: { event: Event }) {
  const start = parseISO(event.start_datetime);
  return (
    <View style={[styles.card, styles.eventCard]}>
      <View style={styles.eventStripe} />
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{event.title}</Text>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={12} color="#6366f1" />
          <Text style={[styles.cardTime, { color: '#6366f1' }]}>{format(start, 'h:mm a')}</Text>
          {event.location ? (
            <>
              <Ionicons name="location-outline" size={12} color="#9ca3af" />
              <Text style={styles.cardTime}>{event.location}</Text>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  dateSub: { fontSize: 13, fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateMain: { fontSize: 26, fontWeight: '800', color: '#111827', marginTop: 1 },
  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6366f1',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
  },
  askBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 8 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  overdueCard: { borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  eventCard: { overflow: 'hidden', paddingLeft: 20 },
  eventStripe: { width: 4, backgroundColor: '#6366f1', borderRadius: 2, position: 'absolute', left: 8, top: 10, bottom: 10 },
  cardLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginTop: 1,
    flexShrink: 0,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  cardTime: { fontSize: 12, color: '#9ca3af' },
  priorityBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  priorityText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyIconBg: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
