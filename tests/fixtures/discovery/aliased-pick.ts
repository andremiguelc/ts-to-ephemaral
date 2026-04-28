// Aliased utility-type as the user's natural target — `type X = Pick<Y, ...>`.
// Symbol-identity matching is what makes this case land; name-based matching
// would miss it because the resolved structural type's symbol differs from
// the underlying interface's symbol.

interface CalendarEvent {
  uid: string;
  startTime: string;
  endTime: string;
  title: string;
  attendees: string[];
  location: string;
}

export type ICSCalendarEvent = Pick<
  CalendarEvent,
  "uid" | "startTime" | "endTime" | "title"
>;

export function buildIcs(event: CalendarEvent): ICSCalendarEvent {
  return {
    uid: event.uid,
    startTime: event.startTime,
    endTime: event.endTime,
    title: event.title,
  };
}
