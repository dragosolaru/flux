"use client";

import { useCallback, useEffect, useState } from "react";

import * as api from "@/lib/api/notifications";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function extractKeys(sub: PushSubscription): { p256dh: string; auth: string } {
  const toB64 = (buf: ArrayBuffer | null) =>
    buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : "";
  return {
    p256dh: toB64(sub.getKey("p256dh")),
    auth: toB64(sub.getKey("auth")),
  };
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    let active = true;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!active) return;
        setIsSupported(true);
        setIsSubscribed(!!sub);
      })
      .catch(() => {
        if (active) setIsSupported(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return false;

      const { publicKey } = await api.getVapidPublicKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await api.subscribePush({ endpoint: sub.endpoint, keys: extractKeys(sub) });
      setIsSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch {
      /* best-effort */
    } finally {
      setBusy(false);
    }
  }, [isSupported]);

  const sendTest = useCallback(async (): Promise<void> => {
    await api.sendTestPush();
  }, []);

  return { isSupported, isSubscribed, busy, subscribe, unsubscribe, sendTest };
}
