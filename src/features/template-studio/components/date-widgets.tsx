"use client";

import { useEditor, useNode } from "@craftjs/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { itemStyle, type ItemProps } from "./items";
import { calendarMonth, countdownParts, eventTimestamp } from "./date-utils";

const defaults = {
  x: 55,
  y: 160,
  width: 370,
  height: 310,
  rotation: 0,
  eventDate: "2027-04-18",
  fontSize: 16,
  fontFamily: "Georgia",
  color: "#493a34",
  background: "#fffaf1",
  accent: "#873b46",
};

export function WidgetBox({
  children,
  baseHeight,
  ...props
}: ItemProps & { children: ReactNode; baseHeight: number }) {
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const {
    id,
    connectors: { connect },
    selected,
  } = useNode((node) => ({ selected: node.events.selected }));
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: props.width ?? 370,
    height: props.height ?? baseHeight,
  });
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(size.width / 370, size.height / baseHeight);
  return (
    <div
      data-studio-node={id}
      ref={(element) => {
        box.current = element;
        if (element) connect(element);
      }}
      style={{
        ...itemStyle(props, selected, enabled),
        fontSize: props.fontSize ?? 16,
        fontFamily: props.fontFamily ?? "Georgia",
        color: props.color ?? "#493a34",
        background: props.background ?? "#fffaf1",
        borderRadius: 12,
        overflow: "hidden",
        boxSizing: "border-box",
        textAlign: "center",
        lineHeight: 1.25,
      }}
    >
      <div
        data-widget-content
        style={{
          position: "absolute",
          width: 370,
          height: baseHeight,
          left: (size.width - 370 * scale) / 2,
          top: (size.height - baseHeight * scale) / 2,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function StudioCalendar(props: ItemProps) {
  const month = calendarMonth(props.eventDate ?? defaults.eventDate);
  return (
    <WidgetBox {...props} baseHeight={310}>
      <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {props.title ?? "Ngày chung đôi"}
      </strong>
      {month ? (
        <>
          <span>
            Tháng {month.month} · {month.year}
          </span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gridTemplateRows: `auto repeat(${Math.ceil((month.offset + month.days) / 7)}, minmax(0, 1fr))`,
              gap: 3,
              flex: 1,
              minHeight: 0,
            }}
          >
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => (
              <small key={label} style={{ opacity: 0.6 }}>
                {label}
              </small>
            ))}
            {Array.from({ length: month.offset }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {Array.from({ length: month.days }, (_, index) => (
              <span
                key={index}
                aria-label={index + 1 === month.day ? `Ngày cưới ${month.day}` : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  background:
                    index + 1 === month.day ? (props.accent ?? defaults.accent) : undefined,
                  color: index + 1 === month.day ? "#ffffff" : undefined,
                }}
              >
                {index + 1}
              </span>
            ))}
          </div>
        </>
      ) : (
        <span>Chọn ngày hợp lệ</span>
      )}
    </WidgetBox>
  );
}
StudioCalendar.craft = { displayName: "Lịch", props: { ...defaults, title: "Ngày chung đôi" } };

export function StudioCountdown(props: ItemProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const target = eventTimestamp(
    props.eventDate ?? defaults.eventDate,
    props.eventTime ?? "17:00",
    props.timezone ?? "Asia/Ho_Chi_Minh",
  );
  const remaining = countdownParts(target, now);
  return (
    <WidgetBox {...props} baseHeight={170}>
      <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {props.title ?? "Đếm ngược ngày cưới"}
      </strong>
      {remaining ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 6,
              flex: 1,
              alignItems: "center",
            }}
          >
            {(["days", "hours", "minutes", "seconds"] as const).map((key, index) => (
              <div key={key}>
                <strong
                  style={{
                    display: "block",
                    color: props.accent ?? defaults.accent,
                    fontSize: (props.fontSize ?? 16) * 1.7,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {String(remaining[key]).padStart(2, "0")}
                </strong>
                <small>{["Ngày", "Giờ", "Phút", "Giây"][index]}</small>
              </div>
            ))}
          </div>
          <small>
            {remaining.ended
              ? "Đã đến ngày hẹn ♥"
              : `${props.eventDate ?? defaults.eventDate} · ${props.eventTime ?? "17:00"} (${props.timezone === "UTC" ? "UTC" : "GMT+7"})`}
          </small>
        </>
      ) : (
        <span>Chọn ngày giờ hợp lệ</span>
      )}
    </WidgetBox>
  );
}
StudioCountdown.craft = {
  displayName: "Đếm ngược",
  props: {
    ...defaults,
    y: 490,
    height: 170,
    title: "Đếm ngược ngày cưới",
    eventTime: "17:00",
    timezone: "Asia/Ho_Chi_Minh",
  },
};
