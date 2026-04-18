import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getDocClient } from "@/lib/dynamo";
import { getEnv } from "@/lib/env";
import type { PostRecord } from "@/types/models";

export async function listVisiblePosts(): Promise<PostRecord[]> {
  const doc = getDocClient();
  const { POSTS_TABLE_NAME } = getEnv();
  const posts: PostRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  const now = new Date().toISOString();

  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: POSTS_TABLE_NAME,
        FilterExpression: "#v = :true",
        ExpressionAttributeNames: { "#v": "visible" },
        ExpressionAttributeValues: { ":true": true },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of res.Items ?? []) {
      const p = item as PostRecord;
      if (p.startDate <= now && p.endDate >= now) {
        posts.push(p);
      }
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  posts.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return posts;
}
