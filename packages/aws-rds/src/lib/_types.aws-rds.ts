import { defineService } from "@iyio/common";
import { RdsClient } from "./RdsClient";

export const rdsClient=defineService<RdsClient>('rdsClient',scope=>RdsClient.fromScope(scope));
