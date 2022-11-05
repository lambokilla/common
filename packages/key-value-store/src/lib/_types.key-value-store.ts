import { defineService, defineType } from "@iyio/common";
import { IKeyValueStore, KeyValueStoreProvider } from "./key-value-store-types";
import { RouterStore } from "./RouterStore";

export const storeService=defineService<RouterStore>("storeService",scope=>new RouterStore(scope));

export const IKeyValueStoreType=defineType<IKeyValueStore|KeyValueStoreProvider>("IKeyValueStoreType");
