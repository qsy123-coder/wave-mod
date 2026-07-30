"use client";

import { useState, useCallback, useRef } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.15;

/**
 * Manages zoom/pan state for the lightbox.
 * Returns a handleWheel callback for native non-passive event attachment.
 */
export function useLightboxZoom() {
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Keep latest values in refs so native handler always reads current state.
  const stateRef = useRef({ scale: MIN_SCALE, offsetX: 0, offsetY: 0 });

  const isZoomed = scale > MIN_SCALE;

  const resetZoom = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    stateRef.current = { scale: MIN_SCALE, offsetX: 0, offsetY: 0 };
  }, []);

  // Sync state → ref on every state change.
  // We update refs inline in setState calls as well, but this catches any missed updates.
  const syncRef = useCallback(() => {
    stateRef.current = {
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  }, [scale, offset]);
  // eslint-disable-next-line react-hooks/refs -- syncRef reads ref as side effect of state change, not for rendering
  syncRef();

  // Native wheel handler — call from addEventListener("wheel", ..., { passive: false })
  const handleWheel = useCallback(
    (e: WheelEvent, containerEl: HTMLElement) => {
      e.preventDefault();

      const { scale: prevScale } = stateRef.current;
      const direction = e.deltaY > 0 ? -1 : 1;
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, prevScale + direction * ZOOM_STEP),
      );

      if (newScale > MIN_SCALE) {
        // Zoom toward cursor
        const rect = containerEl.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const ratio = newScale / prevScale;
        const { offsetX: prevX, offsetY: prevY } = stateRef.current;
        const newX = cx - ratio * (cx - prevX);
        const newY = cy - ratio * (cy - prevY);
        stateRef.current = { scale: newScale, offsetX: newX, offsetY: newY };
        setScale(newScale);
        setOffset({ x: newX, y: newY });
      } else {
        stateRef.current = { scale: MIN_SCALE, offsetX: 0, offsetY: 0 };
        setScale(MIN_SCALE);
        setOffset({ x: 0, y: 0 });
      }
    },
    [],
  );

  // Pan handlers
  const dragRef = useRef({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 });
  const lastTap = useRef({ time: 0, x: 0, y: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isZoomed) return;
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        ox: offset.x,
        oy: offset.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isZoomed, offset],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    const newX = d.ox + (e.clientX - d.startX);
    const newY = d.oy + (e.clientY - d.startY);
    stateRef.current = { ...stateRef.current, offsetX: newX, offsetY: newY };
    setOffset({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  // Double-tap
  const handleDoubleTap = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const now = Date.now();
      const clientX = "touches" in e ? e.changedTouches[0]?.clientX ?? 0 : e.clientX;
      const clientY = "touches" in e ? e.changedTouches[0]?.clientY ?? 0 : e.clientY;
      const dist = Math.hypot(clientX - lastTap.current.x, clientY - lastTap.current.y);

      if (now - lastTap.current.time < 300 && dist < 30) {
        if (stateRef.current.scale > MIN_SCALE) {
          resetZoom();
        } else {
          const rect = e.currentTarget.getBoundingClientRect();
          const cx = clientX - rect.left - rect.width / 2;
          const cy = clientY - rect.top - rect.height / 2;
          stateRef.current = { scale: 2.5, offsetX: -cx * 1.5, offsetY: -cy * 1.5 };
          setScale(2.5);
          setOffset({ x: -cx * 1.5, y: -cy * 1.5 });
        }
      }
      lastTap.current = { time: now, x: clientX, y: clientY };
    },
    [resetZoom],
  );

  return {
    scale,
    offsetX: offset.x,
    offsetY: offset.y,
    isZoomed,
    resetZoom,
    handleWheel,
    handleDoubleTap,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
