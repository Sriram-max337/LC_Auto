/**
 * Vercel / Node serverless entry (file-based API route).
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
import { handleNodeGraphqlProxy } from "../server/proxy-graphql.mjs";

export default async function handler(req, res) {
  await handleNodeGraphqlProxy(req, res);
}
