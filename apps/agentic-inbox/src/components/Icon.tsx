import type { SVGProps } from "react";

export type IconName =
  | "sun"
  | "inbox"
  | "calendar"
  | "chat"
  | "video"
  | "catchup"
  | "board"
  | "radar"
  | "hash"
  | "people"
  | "settings"
  | "more"
  | "spark"
  | "bell"
  | "back"
  | "close"
  | "send"
  | "logout"
  | "search";

const PATH: Record<IconName, string> = {
  sun: "M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  inbox: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-11zM4 13h4.2l.9 1.8h5.8l.9-1.8H20",
  calendar: "M7 4v3M17 4v3M5 9h14M6.5 6.5h11A1.5 1.5 0 0 1 19 8v10.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5V8A1.5 1.5 0 0 1 6.5 6.5z",
  chat: "M5 18.5 7.2 16H17a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10.5z",
  video: "M15 10.2V8.5A1.5 1.5 0 0 0 13.5 7h-8A1.5 1.5 0 0 0 4 8.5v7A1.5 1.5 0 0 0 5.5 17h8a1.5 1.5 0 0 0 1.5-1.5v-1.7l4.2 2.4V7.8L15 10.2z",
  catchup: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 5v4h4",
  board: "M5 5.5h4.5v13H5zM10.75 5.5h4.5v8h-4.5zM16.5 5.5H21v10.5h-4.5z",
  radar: "M12 12a2.2 2.2 0 1 0 0.01 0M12 6.2A5.8 5.8 0 1 1 6.2 12M12 3.2A8.8 8.8 0 1 1 3.2 12",
  hash: "M5 9h14M5 15h14M10 4 8 20M16 4l-2 16",
  people: "M16.5 18.5c0-2.2-2-3.5-4.5-3.5s-4.5 1.3-4.5 3.5M12 12.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2M19.2 18.2c.3-1.6-.7-2.8-2.2-3.2M16.6 9.2a2.1 2.1 0 1 1 1.3 3.8",
  settings:
    "M12 9.4A2.6 2.6 0 1 1 12 14.6 2.6 2.6 0 0 1 12 9.4zM12 3.5l1.1 2.2 2.4-.4 1.2 2.1 2.1 1.2-.4 2.4 2.2 1.1-2.2 1.1.4 2.4-2.1 1.2-1.2 2.1-2.4-.4L12 20.5l-1.1-2.2-2.4.4-1.2-2.1-2.1-1.2.4-2.4L3.4 12l2.2-1.1-.4-2.4 2.1-1.2 1.2-2.1 2.4.4z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  spark: "M12 3.5 13.4 9l5.6 1.4L13.4 12 12 17.5 10.6 12 5 10.4 10.6 9zM18 15.5l.7 2.3 2.3.7-2.3.7L18 21.5l-.7-2.3-2.3-.7 2.3-.7z",
  bell: "M6.2 16.5h11.6l-1.1-1.6V10a4.7 4.7 0 0 0-9.4 0v4.9zM10 16.5a2 2 0 0 0 4 0",
  back: "M14.5 6 8.5 12l6 6",
  close: "M7 7l10 10M17 7 7 17",
  send: "M5 12h14M13 6l6 6-6 6",
  logout: "M10 6H7.5A1.5 1.5 0 0 0 6 7.5v9A1.5 1.5 0 0 0 7.5 18H10M13 8l4 4-4 4M9 12h8",
  search: "M11 6.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM16.5 16.5 19 19",
};

export function Icon({ name, className, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className ?? ""}`.trim()}
      aria-hidden
      {...rest}
    >
      <path d={PATH[name]} />
    </svg>
  );
}
