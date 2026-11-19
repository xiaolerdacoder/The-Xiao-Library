import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey || !openAiKey) return json({ error: "Moderation service is not configured." }, 503);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign-in required." }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Sign-in required." }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }

  if (body.action === "submit") {
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const category = String(body.category || "");
    const fileName = String(body.file_name || "");
    const fileType = String(body.file_type || "application/octet-stream");
    const stagePath = String(body.stage_path || "");
    const fileSize = Number(body.file_size);
    if (!title || title.length > 80 || description.length > 500 || !["sprite", "sound", "photo", "video", "other"].includes(category) || !stagePath.startsWith(`${user.id}/`) || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 25 * 1024 * 1024) return json({ error: "Invalid upload details." }, 400);
    const { data: signed, error: signedError } = await admin.storage.from("assets-staging").createSignedUrl(stagePath, 180);
    if (signedError || !signed?.signedUrl) return json({ error: "Could not read the staged upload." }, 400);

    const inputs: Array<Record<string, unknown>> = [{ type: "text", text: `Title: ${title}\nDescription: ${description}\nFile name: ${fileName}` }];
    if (fileType.startsWith("image/")) inputs.push({ type: "image_url", image_url: { url: signed.signedUrl } });
    let moderation: Record<string, unknown>;
    try {
      const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "omni-moderation-latest", input: inputs }),
      });
      if (!response.ok) return json({ error: "AI moderation could not complete; the upload was not published. Please try again later." }, 503);
      const result = await response.json();
      moderation = result.results?.[0] || {};
    } catch {
      return json({ error: "AI moderation could not connect; the upload was not published. Please try again later." }, 503);
    }

    const flagged = moderation.flagged === true;
    let fileUrl = "";
    let status = "pending";
    if (!flagged) {
      const { data: file, error: downloadError } = await admin.storage.from("assets-staging").download(stagePath);
      if (downloadError || !file) return json({ error: "Could not process the staged upload." }, 500);
      const { error: publishError } = await admin.storage.from("assets").upload(stagePath, file, { contentType: fileType, upsert: false });
      if (publishError) return json({ error: "Could not publish the approved upload." }, 500);
      fileUrl = admin.storage.from("assets").getPublicUrl(stagePath).data.publicUrl;
      status = "approved";
      await admin.storage.from("assets-staging").remove([stagePath]);
    }
    const categories = (moderation.categories || {}) as Record<string, unknown>;
    const { data: asset, error: insertError } = await admin.from("assets").insert({
      title, description, category, file_name: fileName, file_type: fileType, file_size: fileSize,
      file_url: fileUrl, file_path: flagged ? stagePath : stagePath, uploader_id: user.id, status,
      moderation_categories: flagged ? categories : {},
    }).select("id,status").single();
    if (insertError) {
      if (status === "approved") await admin.storage.from("assets").remove([stagePath]);
      return json({ error: "Could not save the moderated upload." }, 500);
    }
    return json({ id: asset.id, status: asset.status, flagged });
  }

  if (body.action === "review") {
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ error: "Admin access required." }, 403);
    const assetId = String(body.asset_id || "");
    const decision = String(body.decision || "");
    if (!assetId || !["approve", "reject"].includes(decision)) return json({ error: "Invalid review action." }, 400);
    const { data: asset, error: assetError } = await admin.from("assets").select("id,status,file_path,file_type").eq("id", assetId).eq("status", "pending").maybeSingle();
    if (assetError || !asset) return json({ error: "Pending upload not found." }, 404);
    if (decision === "reject") {
      await admin.storage.from("assets-staging").remove([asset.file_path]);
      const { error } = await admin.from("assets").delete().eq("id", assetId);
      if (error) return json({ error: "Could not reject the upload." }, 500);
      return json({ status: "rejected" });
    }
    const { data: file, error: downloadError } = await admin.storage.from("assets-staging").download(asset.file_path);
    if (downloadError || !file) return json({ error: "Staged file is unavailable." }, 500);
    const { error: publishError } = await admin.storage.from("assets").upload(asset.file_path, file, { contentType: asset.file_type, upsert: false });
    if (publishError) return json({ error: "Could not publish the reviewed upload." }, 500);
    const fileUrl = admin.storage.from("assets").getPublicUrl(asset.file_path).data.publicUrl;
    const { error: updateError } = await admin.from("assets").update({ status: "approved", file_url: fileUrl, moderation_categories: {} }).eq("id", assetId);
    if (updateError) { await admin.storage.from("assets").remove([asset.file_path]); return json({ error: "Could not mark upload approved." }, 500); }
    await admin.storage.from("assets-staging").remove([asset.file_path]);
    return json({ status: "approved" });
  }
  return json({ error: "Unknown action." }, 400);
});
