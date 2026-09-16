/**
 * FullCalendar UI Integration
 */
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { classifyEvent } from './slot-filter.js';

let calendarInstance = null;
let currentEvents = [];

/**
 * Initialize FullCalendar in #calendar-root
 */
export function initCalendar(elementId, { onEventClick, onDateSelect }) {
  const calendarEl = document.getElementById(elementId);
  if (!calendarEl) return null;

  calendarInstance = new Calendar(calendarEl, {
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    locale: 'ja',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
    },
    buttonText: {
      today: '今日',
      month: '月',
      week: '週',
      day: '日',
      list: 'リスト'
    },
    navLinks: true,
    nowIndicator: true,
    selectable: true,
    editable: false,
    allDaySlot: true,
    allDayText: '終日',
    slotMinTime: '08:00:00',
    slotMaxTime: '23:00:00',
    slotDuration: '00:30:00',
    dayMaxEvents: true,
    eventClick: (info) => {
      const originalEvent = currentEvents.find(e => e.id === info.event.id) || {
        id: info.event.id,
        summary: info.event.title,
        start: { dateTime: info.event.start?.toISOString() },
        end: { dateTime: info.event.end?.toISOString() },
        description: info.event.extendedProps?.description,
        location: info.event.extendedProps?.location
      };
      if (onEventClick) {
        onEventClick(originalEvent);
      }
    },
    select: (info) => {
      if (onDateSelect) {
        onDateSelect(info);
      }
    }
  });

  calendarInstance.render();
  return calendarInstance;
}

/**
 * Update calendar events
 */
export function updateCalendarEvents(events) {
  currentEvents = events || [];
  if (!calendarInstance) return;

  calendarInstance.removeAllEvents();

  const fcEvents = currentEvents.map(event => {
    const classification = classifyEvent(event);
    let className = 'event-other';
    if (classification.type === 'lesson') {
      className = classification.isOpenSlot ? 'event-open' : 'event-lesson';
    } else if (classification.type === 'shift') {
      className = 'event-shift';
    }

    const start = event.start?.dateTime || event.start?.date;
    const end = event.end?.dateTime || event.end?.date;
    const isAllDay = !event.start?.dateTime && Boolean(event.start?.date);

    return {
      id: event.id,
      title: event.summary || '(タイトルなし)',
      start,
      end,
      allDay: isAllDay,
      className: [className],
      extendedProps: {
        description: event.description || '',
        location: event.location || '',
        htmlLink: event.htmlLink || '',
        classification
      }
    };
  });

  calendarInstance.addEventSource(fcEvents);
}

/**
 * Refreshes calendar view size when switching tabs
 */
export function refreshCalendarSize() {
  if (calendarInstance) {
    calendarInstance.updateSize();
  }
}
