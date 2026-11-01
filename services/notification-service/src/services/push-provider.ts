import { Expo } from "expo-server-sdk";
import { prisma } from "../lib/prisma";

type PushMessage = { token: string; title: string; body: string; data: Record<string, unknown> };

export interface PushProvider {
  send(messages: PushMessage[]): Promise<Set<string>>;
}

export class MockPushProvider implements PushProvider {
  async send(messages: PushMessage[]): Promise<Set<string>> {
    return new Set(messages.map((message) => message.token));
  }
}

export class ExpoPushProvider implements PushProvider {
  private readonly expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

  async send(messages: PushMessage[]): Promise<Set<string>> {
    const valid = messages.filter((message) => Expo.isExpoPushToken(message.token));
    const sent = new Set<string>();
    for (const chunk of this.expo.chunkPushNotifications(valid.map((message) => ({ to: message.token, title: message.title, body: message.body, data: message.data })))) {
      const receipts = await this.expo.sendPushNotificationsAsync(chunk);
      receipts.forEach((receipt, index) => {
        const token = chunk[index]?.to;
        if (receipt.status === "ok" && typeof token === "string") sent.add(token);
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered" && typeof token === "string") {
          void prisma.deviceToken.updateMany({ where: { token }, data: { isActive: false } });
        }
      });
    }
    return sent;
  }
}

export const createPushProvider = (): PushProvider => process.env.PUSH_PROVIDER === "expo" ? new ExpoPushProvider() : new MockPushProvider();
