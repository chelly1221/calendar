package kr.threechan.calendar.widget;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.*;
import java.util.*;

public final class WidgetCalendar {
    public static final class Entry {
        public String title, color, time, key, recurrenceId;
        public boolean allDay;
        public long order;
    }
    public static LocalDate firstDay(YearMonth month, int firstWeekday) {
        LocalDate first = month.atDay(1);
        int day = first.getDayOfWeek().getValue() % 7;
        return first.minusDays((day - firstWeekday + 7) % 7);
    }
    public static int weekCount(YearMonth month, int firstWeekday, boolean fixed) {
        if (fixed) return 6;
        return (int) ((java.time.temporal.ChronoUnit.DAYS.between(firstDay(month, firstWeekday), month.atEndOfMonth()) + 7) / 7);
    }
    public static int capacity(float heightDp, int rows, float lineHeight, float dateHeight, int padding, boolean footer, int max) {
        float cell = (heightDp - 48 - 20 - (footer ? 22 : 0) - padding * 2) / rows;
        int slots = Math.max(0, (int)Math.floor((cell - dateHeight - 2) / lineHeight));
        // Bound RemoteViews payloads while allowing large home screens to use their height.
        return Math.min(slots, max == 0 ? 16 : max);
    }
    public static Map<LocalDate, List<Entry>> entries(JSONObject snapshot, WidgetConfig config, LocalDate first, int days, ZoneId zone) {
        Map<String,String> colors = new HashMap<>();
        JSONArray calendars = snapshot.optJSONArray("calendars");
        if (calendars != null) for (int i=0; i<calendars.length(); i++) {
            JSONObject c = calendars.optJSONObject(i);
            if (c != null) colors.put(c.optString("id"), c.optString("color", "#b59ae8"));
        }
        Map<LocalDate,List<Entry>> result = new HashMap<>();
        LocalDate until = first.plusDays(days);
        JSONArray events = snapshot.optJSONArray("events");
        if (events == null) return result;
        for (int i=0; i<events.length(); i++) {
            JSONObject raw = events.optJSONObject(i);
            if (raw == null || !config.includes(raw.optString("calendarId"))) continue;
            boolean allDay = raw.optBoolean("allDay");
            if (!config.flag(allDay ? "allDay" : "timed", true)) continue;
            try {
                LocalDate startDay, endDay;
                ZonedDateTime start = null, end = null;
                if (allDay) { startDay=LocalDate.parse(raw.getString("startDay")); endDay=LocalDate.parse(raw.getString("endDay")); }
                else {
                    if (raw.optBoolean("floating")) {
                        start=LocalDateTime.parse(raw.getString("startLocal")).atZone(zone);
                        end=LocalDateTime.parse(raw.getString("endLocal")).atZone(zone);
                    } else {
                        start=Instant.ofEpochMilli(raw.getLong("start")).atZone(zone);
                        end=Instant.ofEpochMilli(raw.getLong("end")).atZone(zone);
                    }
                    startDay=start.toLocalDate();
                    endDay=end.toLocalDate();
                    if (!end.toLocalTime().equals(LocalTime.MIDNIGHT) || !end.isAfter(start)) endDay=endDay.plusDays(1);
                }
                if (!endDay.isAfter(startDay)) endDay=startDay.plusDays(1);
                LocalDate from=startDay.isBefore(first)?first:startDay;
                LocalDate to=endDay.isAfter(until)?until:endDay;
                for (LocalDate day=from; day.isBefore(to); day=day.plusDays(1)) {
                    Entry e=new Entry(); e.title=raw.optString("title", "제목 없는 일정").replaceAll("[\\r\\n\\t]+", " ");
                    e.key=raw.optString("key");e.recurrenceId=raw.optString("recurrenceId");
                    String ownColor=raw.optString("color");
                    e.color=ownColor.matches("#[a-fA-F0-9]{6}")?ownColor:colors.getOrDefault(raw.optString("calendarId"), "#b59ae8"); e.allDay=allDay;
                    e.time=!allDay && day.equals(startDay) ? start.toLocalTime().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")) : "";
                    e.order=allDay?startDay.toEpochDay()*86400000L:start.toInstant().toEpochMilli();
                    result.computeIfAbsent(day, k -> new ArrayList<>()).add(e);
                }
            } catch (Exception ignored) { /* Only validated snapshots are published by the app. */ }
        }
        Comparator<Entry> byTime=Comparator.comparingLong((Entry e)->e.order).thenComparing(e->e.title);
        Comparator<Entry> sorter=config.flag("allDayFirst",true)?Comparator.comparing((Entry e)->!e.allDay).thenComparing(byTime):byTime;
        for(List<Entry> list:result.values()) list.sort(sorter);
        return result;
    }
}
