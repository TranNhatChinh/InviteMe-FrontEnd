"use client";
/* eslint-disable @next/next/no-img-element -- Album images are DOM targets inside the scaled editor widget. */

import { useEditor, useNode } from "@craftjs/core";
import { useContext, useState, type CSSProperties, type ReactNode } from "react";
import { PhotoFocusContext } from "./photo-focus";
import { createPortal } from "react-dom";
import { WidgetBox } from "./date-widgets";
import { eventTimestamp } from "./date-utils";
import type { ItemProps } from "./items";
import { InvitationGuestContext } from "./invitation-guest-context";
import { useStudioMode } from "./studio-mode-context";
import Link from "next/link";

const buttonStyle: CSSProperties = {
  border: 0,
  borderRadius: 30,
  padding: "12px 24px",
  font: "inherit",
  cursor: "pointer",
};
const defaults = {
  x: 55,
  y: 200,
  width: 370,
  rotation: 0,
  fontSize: 16,
  fontFamily: "EB Garamond",
  color: "#7c6a60",
  background: "#faf4ec",
  accent: "#7c6a60",
};

function Popup({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#0008",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: "#faf4ec",
          color: "#7c6a60",
          padding: 28,
          borderRadius: 16,
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 20px 80px #0004",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          aria-label="Đóng hộp thoại"
          onClick={close}
          style={{ float: "right", cursor: "pointer" }}
        >
          ✕
        </button>
        <h2 style={{ fontFamily: "EB Garamond, Georgia, serif", fontSize: 28, marginBottom: 20 }}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function StudioAlbum(props: ItemProps) {
  const { enabled, actions } = useEditor((state) => ({ enabled: state.options.enabled }));
  const { id } = useNode();
  const { focus, select } = useContext(PhotoFocusContext);
  const [index, setIndex] = useState(0);
  const photos = props.images?.length ? props.images : ["/images/templates/invite-portrait.png"];
  const current = (enabled && focus?.nodeId === id ? focus.index : index) % photos.length;
  function choosePhoto(next: number) {
    const normalized = (next + photos.length) % photos.length;
    if (enabled) {
      actions.selectNode(id);
      select(id, normalized);
    } else setIndex(normalized);
  }
  return (
    <WidgetBox {...props} baseHeight={430}>
      <strong style={{ fontSize: 20 }}>{props.title ?? "ALBUM ẢNH"}</strong>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {[-1, 0, 1].map((offset) => (
          <img
            key={offset}
            src={photos[(current + offset + photos.length) % photos.length]}
            alt={`Ảnh album ${((current + offset + photos.length) % photos.length) + 1}`}
            data-album-photo={(current + offset + photos.length) % photos.length}
            onPointerDown={(event) => {
              if (enabled) event.stopPropagation();
            }}
            onClick={() => {
              if (enabled) choosePhoto(current + offset);
            }}
            style={{
              position: "absolute",
              top: offset === 0 ? 0 : 40,
              left: offset === 0 ? 65 : offset < 0 ? -8 : 220,
              width: offset === 0 ? 210 : 125,
              height: offset === 0 ? "100%" : "76%",
              objectFit: "cover",
              borderRadius: 10,
              opacity: offset === 0 ? 1 : 0.55,
              transform: offset === 0 ? undefined : `rotate(${offset * 8}deg)`,
              zIndex: offset === 0 ? 1 : 0,
              pointerEvents: enabled ? "auto" : "none",
              cursor: enabled ? "pointer" : undefined,
              outline:
                enabled && focus?.nodeId === id && offset === 0 ? "2px solid #368cff" : undefined,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 20, alignItems: "center" }}>
        <button
          aria-label="Ảnh trước"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => choosePhoto(current - 1)}
          style={buttonStyle}
        >
          ‹
        </button>
        <span>
          {current + 1} / {photos.length}
        </span>
        <button
          aria-label="Ảnh sau"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => choosePhoto(current + 1)}
          style={buttonStyle}
        >
          ›
        </button>
      </div>
    </WidgetBox>
  );
}
StudioAlbum.craft = {
  displayName: "Album ảnh",
  props: { ...defaults, height: 430, title: "ALBUM ẢNH", images: [] },
};

export function StudioMap(props: ItemProps) {
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const address = props.address ?? "194 Hoàng Văn Thụ, Phú Nhuận, TP. Hồ Chí Minh";
  return (
    <WidgetBox {...props} baseHeight={350}>
      <strong>{props.title ?? "Tiệc cưới sẽ tổ chức tại"}</strong>
      <p style={{ fontSize: 13 }}>{address}</p>
      {enabled ? (
        <div
          style={{
            flex: 1,
            background: "#e6e0d5",
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            backgroundImage:
              "linear-gradient(35deg, transparent 40%, #fff7 41%, #fff7 44%, transparent 45%), linear-gradient(125deg, transparent 50%, #fff7 51%, #fff7 54%, transparent 55%)",
          }}
        >
          <span>⌖ Bản đồ địa điểm</span>
        </div>
      ) : (
        <iframe
          title="Bản đồ địa điểm"
          loading="lazy"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
          style={{ flex: 1, width: "100%", minHeight: 0, border: 0, borderRadius: 8 }}
        />
      )}
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={enabled ? -1 : 0}
        style={{
          ...buttonStyle,
          color: "#fff",
          background: props.accent ?? defaults.accent,
          pointerEvents: enabled ? "none" : undefined,
        }}
      >
        Chỉ đường ↗
      </a>
    </WidgetBox>
  );
}
StudioMap.craft = {
  displayName: "Bản đồ",
  props: {
    ...defaults,
    height: 350,
    title: "Tiệc cưới sẽ tổ chức tại",
    address: "Trung Tâm Hội Nghị White Palace, 194 Hoàng Văn Thụ, Phú Nhuận, TP. Hồ Chí Minh",
  },
};

export function StudioAction(props: ItemProps) {
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const guestToken = useContext(InvitationGuestContext);
  const mode = useStudioMode();
  const isWebsite = mode === "website";
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const kind = props.action ?? "rsvp";
  const title = props.title ?? "XÁC NHẬN THAM DỰ";
  const timestamp = eventTimestamp(
    props.eventDate ?? "2027-01-03",
    props.eventTime ?? "18:00",
    props.timezone ?? "Asia/Ho_Chi_Minh",
  );
  const format = (value: number) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const calendarUrl = Number.isFinite(timestamp)
    ? `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(props.message ?? "Ngày cưới của chúng mình")}&dates=${format(timestamp)}/${format(timestamp + 7200000)}&location=${encodeURIComponent(props.address ?? "")}`
    : undefined;
  return (
    <WidgetBox {...props} baseHeight={70}>
      {kind === "calendar" ? (
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...buttonStyle,
            color: props.color ?? defaults.color,
            pointerEvents: enabled ? "none" : undefined,
          }}
          tabIndex={enabled ? -1 : 0}
        >
          {title}
        </a>
      ) : isWebsite && kind === "rsvp" ? (
        <div style={{ display: "grid", placeItems: "center", gap: 4 }}>
          <button
            disabled
            style={{
              ...buttonStyle,
              background: "#9ca3af",
              color: "#ffffff",
              cursor: "not-allowed",
              opacity: 0.6,
            }}
            title="RSVP không khả dụng trên Website"
          >
            {title}
          </button>
          <small style={{ fontSize: 11, color: "#6b7280" }}>
            Xác nhận tham dự chỉ hỗ trợ qua thiệp mời cá nhân.
          </small>
        </div>
      ) : isWebsite && kind === "gift" ? (
        <div style={{ display: "grid", placeItems: "center", gap: 4 }}>
          <button
            disabled
            style={{
              ...buttonStyle,
              background: "#9ca3af",
              color: "#ffffff",
              cursor: "not-allowed",
              opacity: 0.6,
            }}
            title="Tính năng đang được phát triển ở studio của wedding story không cho dùng"
          >
            {title}
          </button>
          <small style={{ fontSize: 11, color: "#6b7280" }}>
            Tính năng đang được phát triển ở studio của wedding story không cho dùng.
          </small>
        </div>
      ) : kind === "rsvp" && guestToken && !enabled ? (
        <Link
          href={`/invite/${encodeURIComponent(guestToken)}/rsvp`}
          style={{ ...buttonStyle, background: props.accent ?? defaults.accent, color: "white" }}
        >
          {title}
        </Link>
      ) : (
        <button
          disabled={enabled}
          onClick={() => {
            if (kind === "gift" && guestToken && !enabled) {
              window.dispatchEvent(new CustomEvent("inviteme:open-gift"));
              return;
            }
            setSubmitted(false);
            setOpen(true);
          }}
          style={{ ...buttonStyle, background: props.accent ?? defaults.accent, color: "white" }}
        >
          {title}
        </button>
      )}
      {open && !isWebsite && (
        <Popup
          title={kind === "gift" ? "Hộp quà mừng" : "Xác nhận tham dự"}
          close={() => setOpen(false)}
        >
          {kind === "gift" ? (
            <p>{props.message ?? "Sự hiện diện và lời chúc của bạn là món quà quý giá nhất."}</p>
          ) : submitted ? (
            <p role="status">Đã ghi nhận phản hồi trong bản xem thử. Chưa gửi đến máy chủ.</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(true);
              }}
              style={{ display: "grid", gap: 14 }}
            >
              <label>
                Họ tên
                <input
                  required
                  name="guestName"
                  maxLength={150}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #d5c9bc",
                    borderRadius: 6,
                  }}
                />
              </label>
              <label>
                Tham dự
                <select name="attendance" style={{ width: "100%", padding: 10 }}>
                  <option value="yes">Mình sẽ tham dự</option>
                  <option value="no">Rất tiếc, mình không thể đến</option>
                </select>
              </label>
              <label>
                Số người
                <input
                  type="number"
                  name="count"
                  min={1}
                  max={10}
                  defaultValue={1}
                  required
                  style={{ width: "100%", padding: 10 }}
                />
              </label>
              <small>Bản xem thử: phản hồi chỉ hiển thị ở phiên này.</small>
              <button
                type="submit"
                style={{
                  ...buttonStyle,
                  background: props.accent ?? defaults.accent,
                  color: "white",
                }}
              >
                Gửi xác nhận
              </button>
            </form>
          )}
        </Popup>
      )}
    </WidgetBox>
  );
}
StudioAction.craft = {
  displayName: "Nút / RSVP",
  props: { ...defaults, height: 70, action: "rsvp", title: "XÁC NHẬN THAM DỰ" },
};

export function StudioWishes(props: ItemProps) {
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const mode = useStudioMode();
  const isWebsite = mode === "website";
  const [messages, setMessages] = useState([
    { name: "Bạn bè", text: "Chúc hai bạn luôn yêu thương và hạnh phúc!" },
  ]);
  return (
    <WidgetBox {...props} baseHeight={440}>
      <strong style={{ fontSize: 23 }}>{props.title ?? "Sổ lưu bút"}</strong>
      {isWebsite ? (
        <div style={{ display: "grid", gap: 8, opacity: 0.6 }}>
          <div
            style={{
              padding: "8px 12px",
              background: "#e5e7eb",
              borderRadius: 6,
              fontSize: 12,
              color: "#4b5563",
              textAlign: "center",
            }}
          >
            Tính năng đang được phát triển ở studio của wedding story k cho dùng
          </div>
          <input
            aria-label="Tên người gửi lời chúc"
            placeholder="Nhập tên*"
            disabled
            style={{ padding: 10, border: "1px solid #d5c9bc", borderRadius: 6, cursor: "not-allowed" }}
          />
          <textarea
            aria-label="Lời chúc"
            placeholder="Nhập lời chúc*"
            disabled
            style={{ padding: 10, height: 80, border: "1px solid #d5c9bc", borderRadius: 6, cursor: "not-allowed" }}
          />
          <button
            disabled
            style={{ ...buttonStyle, color: "white", background: "#9ca3af", cursor: "not-allowed" }}
          >
            GỬI LỜI CHÚC
          </button>
        </div>
      ) : (
        <form
          style={{ display: "grid", gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setMessages((previous) =>
              [
                {
                  name: String(data.get("name")).slice(0, 150),
                  text: String(data.get("wish")).slice(0, 1000),
                },
                ...previous,
              ].slice(0, 3),
            );
            event.currentTarget.reset();
          }}
        >
          <input
            aria-label="Tên người gửi lời chúc"
            name="name"
            placeholder="Nhập tên*"
            required
            maxLength={150}
            disabled={enabled}
            style={{ padding: 10, border: "1px solid #d5c9bc", borderRadius: 6 }}
          />
          <textarea
            aria-label="Lời chúc"
            name="wish"
            placeholder="Nhập lời chúc*"
            required
            maxLength={1000}
            disabled={enabled}
            style={{ padding: 10, height: 80, border: "1px solid #d5c9bc", borderRadius: 6 }}
          />
          <button
            disabled={enabled}
            style={{ ...buttonStyle, color: "white", background: props.accent ?? defaults.accent }}
          >
            GỬI LỜI CHÚC
          </button>
          <small>Lời chúc trong bản xem thử, chưa lưu máy chủ.</small>
        </form>
      )}
      <div style={{ flex: 1, overflow: "auto", textAlign: "left", opacity: isWebsite ? 0.6 : 1 }}>
        {messages.map((message, index) => (
          <div key={index} style={{ borderBottom: "1px solid #d5c9bc", padding: "10px 0" }}>
            <strong>{message.name}</strong>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
    </WidgetBox>
  );
}
StudioWishes.craft = {
  displayName: "Sổ lưu bút",
  props: { ...defaults, height: 440, title: "Sổ lưu bút" },
};
