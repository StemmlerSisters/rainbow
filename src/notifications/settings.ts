import { MMKV } from 'react-native-mmkv';
import { STORAGE_IDS } from '@/model/mmkv';
import { useCallback, useState } from 'react';
import messaging from '@react-native-firebase/messaging';
import Logger from '@/utils/logger';

type ValueOf<T> = T[keyof T];

export const NotificationTopic = {
  SENT: 'sent',
  RECEIVED: 'received',
  PURCHASED: 'purchased',
  SOLD: 'sold',
  MINTED: 'minted',
  SWAPPED: 'swapped',
  APPROVALS: 'approvals',
  OTHER: 'other',
};

export const NotificationRelationship = {
  OWNER: 'owner',
  WATCHER: 'watcher',
};

export type WalletNotificationSettingsType = {
  address: string;
  topics: ValueOf<typeof NotificationTopic>[];
  enabled: boolean;
  type: ValueOf<typeof NotificationRelationship>;
};

const WALLET_TOPICS_STORAGE_KEY = 'notificationSettings';
const WALLET_GROUPS_STORAGE_KEY = 'notificationGroupToggle';
export const NOTIFICATIONS_DEFAULT_CHAIN_ID = 1; // hardcoded mainnet for now

const storage = new MMKV({
  id: STORAGE_IDS.NOTIFICATIONS,
});

/* 
  Grabs notification settings for all wallets if they exist,
  otherwise returns an empty array.
*/
export const getAllNotificationSettingsFromStorage = () => {
  const data = storage.getString(WALLET_TOPICS_STORAGE_KEY);

  if (data) return JSON.parse(data);
  return [];
};

/*
  Checks if notification settings exist for a wallet and returns a boolean.
*/
export const walletHasNotificationSettings = (address: string) => {
  const data = getAllNotificationSettingsFromStorage();
  const settings = data.find(
    (wallet: WalletNotificationSettingsType) => wallet.address === address
  );

  return !!settings;
};

/*
  1. Reads notification settings for all wallets from storage.
  2. Matches settings for the wallet with the given address.
  3. Excludes that wallet from the array and saves the new array.
  4. Unsubscribes the wallet from all notification topics on Firebase.
*/
export const removeNotificationSettingsForWallet = (address: string) => {
  const allSettings = getAllNotificationSettingsFromStorage();
  const settingsForWallet = allSettings.find(
    (wallet: WalletNotificationSettingsType) => wallet.address === address
  );
  const newSettings = allSettings.filter(
    (wallet: WalletNotificationSettingsType) => wallet.address !== address
  );
  storage.set(WALLET_TOPICS_STORAGE_KEY, JSON.stringify(newSettings));
  unsubscribeWalletFromAllNotificationTopics(
    settingsForWallet.type,
    NOTIFICATIONS_DEFAULT_CHAIN_ID,
    address
  );
};

/* 
  1. Checks if notification settings already exist for the given address.
  2. Grabs all notification settings from storage.
  3. Appends default settings for the given address to the array.
  4. Saves the new array to storage.
  5. Subscribes the wallet to all notification topics on Firebase.
*/
export const addDefaultNotificationSettingsForWallet = (
  address: string,
  relationship: string
) => {
  const existingSettings = walletHasNotificationSettings(address);
  const defaultTopicSettings = {};
  Object.values(NotificationTopic).forEach(
    // @ts-expect-error: Object.values() returns a string[]
    topic => (defaultTopicSettings[topic] = true)
  );

  if (!existingSettings) {
    const settings = getAllNotificationSettingsFromStorage();
    const newSettings = [
      ...settings,
      {
        address,
        topics: defaultTopicSettings,
        enabled: true,
        type: relationship,
      },
    ];
    storage.set(WALLET_TOPICS_STORAGE_KEY, JSON.stringify(newSettings));
    subscribeWalletToAllNotificationTopics(
      relationship,
      NOTIFICATIONS_DEFAULT_CHAIN_ID,
      address
    );

    // TODO: send wallet address to refraction
  } else {
    console.log(
      `================== ${address}, ${relationship} ==================`
    );
    // TODO: check if wallet relationship matches existing settings
    // unsub from watcher topics if owner and re-sub as owner
  }
};

/* 
  Checks if group notification settings are present in storage
  and adds default values for them if they do not exist.
*/
export const addDefaultNotificationGroupSettings = () => {
  const data = storage.getString(WALLET_GROUPS_STORAGE_KEY);

  if (!data) {
    const defaultSettings = {
      [NotificationRelationship.OWNER]: true,
      [NotificationRelationship.WATCHER]: true,
    };
    storage.set(WALLET_GROUPS_STORAGE_KEY, JSON.stringify(defaultSettings));
  }
};

// Runs the above function when the app is loaded to make sure settings are always present.
addDefaultNotificationGroupSettings();

/*
  * Hook for getting and setting notification settings for a single wallet.

  Returns an object with the wallet address, enabled/disabled topics, relationship,
  and a main boolean for enabling/disabling all notifications for this wallet.

  Also returns a function for updating settings.
  The function saves new option values to storage and handles 
  subscribing/unsubscribing to Firebase based on selected topics for this wallet.
*/
export const useNotificationSettings = (address: string) => {
  const data = getAllNotificationSettingsFromStorage();
  const settingsForWallet = data.find(
    (wallet: WalletNotificationSettingsType) => wallet.address === address
  );
  const [notifications, setNotificationSettings] = useState(settingsForWallet);

  const updateSettings = useCallback(
    (options: object) => {
      const newSettings = data.map((wallet: WalletNotificationSettingsType) => {
        if (wallet.address === address) {
          return { ...wallet, ...options };
        }
        return wallet;
      });
      const newSettingsForWallet = newSettings.find(
        (wallet: WalletNotificationSettingsType) => wallet.address === address
      );
      storage.set(WALLET_TOPICS_STORAGE_KEY, JSON.stringify(newSettings));
      setNotificationSettings(newSettingsForWallet);
    },
    [address, data]
  );

  return { notifications, updateSettings };
};

/* 
  Hook for getting and setting notification settings for all wallets 
  in an owned/watched group.

  Returns a boolean for two groups: owned and watched.
  Provides a function for updating the group settings.
*/
export const useWalletGroupNotificationSettings = () => {
  const existingGroupSettings = JSON.parse(
    // @ts-expect-error: MMKV
    storage.getString(WALLET_GROUPS_STORAGE_KEY)
  );
  const allWallets = getAllNotificationSettingsFromStorage();
  const ownedWallets = allWallets.filter(
    (wallet: WalletNotificationSettingsType) =>
      wallet.type === NotificationRelationship.OWNER
  );
  const watchedWallets = allWallets.filter(
    (wallet: WalletNotificationSettingsType) =>
      wallet.type === NotificationRelationship.WATCHER
  );
  const [ownerEnabled, setOwnerEnabled] = useState(
    existingGroupSettings[NotificationRelationship.OWNER]
  );
  const [watcherEnabled, setWatcherEnabled] = useState(
    existingGroupSettings[NotificationRelationship.WATCHER]
  );

  const updateGroupSettings = useCallback(
    (options: object) => {
      const newSettings = { ...existingGroupSettings, ...options };
      const newOwnerEnabled = newSettings[NotificationRelationship.OWNER];
      const newWatcherEnabled = newSettings[NotificationRelationship.WATCHER];

      setOwnerEnabled(newOwnerEnabled);
      setWatcherEnabled(newWatcherEnabled);
      storage.set(WALLET_GROUPS_STORAGE_KEY, JSON.stringify(newSettings));

      if (newOwnerEnabled !== ownerEnabled) {
        toggleGroupNotifications(
          ownedWallets,
          NotificationRelationship.OWNER,
          newOwnerEnabled
        );
      }

      if (newWatcherEnabled !== watcherEnabled) {
        toggleGroupNotifications(
          watchedWallets,
          NotificationRelationship.WATCHER,
          newWatcherEnabled
        );
      }
    },
    [
      existingGroupSettings,
      ownedWallets,
      ownerEnabled,
      watchedWallets,
      watcherEnabled,
    ]
  );

  return { ownerEnabled, watcherEnabled, updateGroupSettings };
};

/*
  Function for enabling/disabling all notifications for a group of wallets.
  Also used to batch toggle notifications for a single wallet 
  when using the `Allow Notifications` switch in the wallet settings view.
*/
export function toggleGroupNotifications(
  wallets: [],
  relationship: ValueOf<typeof NotificationRelationship>,
  enableNotifications: boolean,
  singleWallet?: boolean
) {
  if (enableNotifications) {
    // loop through all owned wallets, loop through their topics, subscribe to enabled topics
    wallets.forEach((wallet: WalletNotificationSettingsType) => {
      const { topics, address, enabled } = wallet;
      // when toggling a whole group, check if notifications
      // are specifically enabled for this wallet
      if (enabled || singleWallet) {
        Object.keys(topics).forEach(
          (topic: ValueOf<typeof NotificationTopic>) => {
            // @ts-expect-error: topics[topic] is a boolean
            if (topics[topic]) {
              subscribeWalletToSingleNotificationTopic(
                relationship,
                NOTIFICATIONS_DEFAULT_CHAIN_ID,
                address,
                topic
              );
            }
          }
        );
      }
    });
  } else {
    // loop through all owned wallets, unsubscribe from all topics
    wallets.forEach((wallet: WalletNotificationSettingsType) => {
      unsubscribeWalletFromAllNotificationTopics(
        relationship,
        NOTIFICATIONS_DEFAULT_CHAIN_ID,
        wallet.address
      );
    });
  }
}

/*
  Function for subscribing/unsubscribing a wallet to/from a single notification topic.  
*/
export function toggleTopicForWallet(
  relationship: ValueOf<typeof NotificationRelationship>,
  address: string,
  topic: ValueOf<typeof NotificationTopic>,
  enableTopic: boolean
) {
  if (enableTopic) {
    subscribeWalletToSingleNotificationTopic(
      relationship,
      NOTIFICATIONS_DEFAULT_CHAIN_ID,
      address,
      topic
    );
  } else {
    unsubscribeWalletFromSingleNotificationTopic(
      relationship,
      NOTIFICATIONS_DEFAULT_CHAIN_ID,
      address,
      topic
    );
  }
}

/*
  Firebase functions for subscribing/unsubscribing to topics.
*/
const subscribeWalletToAllNotificationTopics = async (
  type: string,
  chainId: number,
  address: string
) => {
  Object.values(NotificationTopic).forEach(topic => {
    Logger.log(`Notifications: subscribing ${type}:${address} to [ ${topic}] `);
    messaging().subscribeToTopic(
      `${type}_${chainId}_${address.toLowerCase()}_${topic}`
    );
  });
};

const unsubscribeWalletFromAllNotificationTopics = async (
  type: string,
  chainId: number,
  address: string
) => {
  Object.values(NotificationTopic).forEach(topic => {
    Logger.log(
      `Notifications: unsubscribing ${type}:${address} from [ ${topic} ]`
    );
    messaging().unsubscribeFromTopic(
      `${type}_${chainId}_${address.toLowerCase()}_${topic}`
    );
  });
};

const subscribeWalletToSingleNotificationTopic = async (
  type: string,
  chainId: number,
  address: string,
  topic: ValueOf<typeof NotificationTopic>
) => {
  Logger.log(`Notifications: subscribing ${type}:${address} to [ ${topic} ]`);
  messaging().subscribeToTopic(
    `${type}_${chainId}_${address.toLowerCase()}_${topic}`
  );
};

const unsubscribeWalletFromSingleNotificationTopic = async (
  type: string,
  chainId: number,
  address: string,
  topic: ValueOf<typeof NotificationTopic>
) => {
  Logger.log(
    `Notifications: unsubscribing ${type}:${address} from [ ${topic} ]`
  );
  messaging().unsubscribeFromTopic(
    `${type}_${chainId}_${address.toLowerCase()}_${topic}`
  );
};