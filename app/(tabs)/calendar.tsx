import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from 'date-fns';
import { listEvents, listTasks, type Event, type Task } from '../../src/db/queries';

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [month, setMonth] = useState(new Date());
  const [dayEvents, setDayEvents] = useState<Event[]>([]);
  const [dayTasks, setDayTasks] = useState<Task[]>([]);
  const [dotDates, setDotDates] = useState<Set<string>>(new Set());

  const loadMonth = useCallback(async (m: Date) => {
    const start = format(startOfMonth(m), 'yyyy-MM-dd');
    const end = format(endOfMonth(m), 'yyyy-MM-dd');
    const events = await listEvents({ start_date: start, end_date: end });
    const dates = new Set<string>(events.map((e) => format(parseISO(e.start_datetime), 'yyyy-MM-dd')));
    setDotDates(dates);
  }, []);

  const loadDay = useCallback(async (d: Date) => {
    const dateStr = format(d, 'yyyy-MM-dd');
    const [events, tasks] = await Promise.all([
      listEvents({ start_date: dateStr, end_date: dateStr }),
      listTasks({ date: dateStr }),
    ]);
    setDayEvents(events);
    setDayTasks(tasks.filter((t) => t.status === 'pending'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMonth(month);
      loadDay(selectedDate);
    }, [month, selectedDate, loadMonth, loadDay])
  );

  const handleMonthChange = (dir: 1 | -1) => {
    const newMonth = dir === 1 ? addMonths(month, 1) : subMonths(month, 1);
    setMonth(newMonth);
    loadMonth(newMonth);
  };

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // Pad to start on Sunday
  const startPad = monthStart.getDay();
  const paddedDays: (Date | null)[] = [...Array(startPad).fill(null), ...days];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>

      {/* Month nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => handleMonthChange(-1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color="#6366f1" />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{format(month, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={() => handleMonthChange(1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={22} color="#6366f1" />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={styles.dayHeaders}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={styles.dayHeader}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {paddedDays.map((day, i) => {
          if (!day) return <View key={`pad-${i}`} style={styles.dayCell} />;
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const hasDot = dotDates.has(dateStr);

          return (
            <TouchableOpacity
              key={dateStr}
              style={styles.dayCell}
              onPress={() => {
                setSelectedDate(day);
                loadDay(day);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.dayCellInner, isSelected && styles.dayCellInnerSelected]}>
                <Text style={[
                  styles.dayNum,
                  isToday && !isSelected && styles.dayNumToday,
                  isSelected && styles.dayNumSelected,
                ]}>
                  {day.getDate()}
                </Text>
              </View>
              {hasDot && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day detail */}
      <Text style={styles.selectedDateLabel}>{format(selectedDate, 'EEEE, MMMM d')}</Text>

      <ScrollView style={styles.scroll}>
        {dayEvents.map((event) => (
          <View key={event.id} style={styles.eventRow}>
            <View style={styles.eventStripe} />
            <View style={styles.eventContent}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventTime}>
                🕐 {format(parseISO(event.start_datetime), 'h:mm a')}
                {event.location ? ` · 📍 ${event.location}` : ''}
              </Text>
            </View>
          </View>
        ))}

        {dayTasks.map((task) => (
          <View key={task.id} style={styles.taskRow}>
            <View style={[styles.taskDot, { backgroundColor: task.priority === 1 ? '#ef4444' : task.priority === 2 ? '#f59e0b' : '#9ca3af' }]} />
            <View style={styles.taskContent}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              {task.due_time && <Text style={styles.taskTime}>⏰ {task.due_time}</Text>}
            </View>
          </View>
        ))}

        {dayEvents.length === 0 && dayTasks.length === 0 && (
          <Text style={styles.emptyDay}>Nothing scheduled for this day</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  navBtn: { padding: 8 },
  navBtnText: { fontSize: 24, color: '#6366f1', fontWeight: '600' },
  monthLabel: { fontSize: 17, fontWeight: '600', color: '#111827' },
  dayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    paddingBottom: 6,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellInnerSelected: { backgroundColor: '#6366f1' },
  dayNum: { fontSize: 14, color: '#374151' },
  dayNumToday: { fontWeight: '700', color: '#6366f1' },
  dayNumSelected: { color: '#fff', fontWeight: '700' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#6366f1', marginTop: 1 },
  dotSelected: { backgroundColor: '#c7d2fe' },
  selectedDateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scroll: { flex: 1 },
  eventRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  eventStripe: { width: 3, backgroundColor: '#6366f1', marginRight: 10, borderRadius: 2 },
  eventContent: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  eventTime: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  taskDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 10 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  taskTime: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  emptyDay: { textAlign: 'center', color: '#9ca3af', marginTop: 32, fontSize: 14 },
});
