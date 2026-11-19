// Uploads are staged privately and checked server-side before publication.
// This client-side module does not contain any AI provider secret keys.
const SUPABASE_URL = "https://vurrpxjvogadkrrmwboi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__WzgG2B_nLMa3tg7CbvXNw_1r6NqvL2";
let moderationClient;

async function getModerationClient() {
  if (!moderationClient) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    moderationClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return moderationClient;
}

// Capture before app.js's regular upload handler so uploads go through private staging + AI review.
document.addEventListener("submit", async (event) => {
  if (event.target?.id !== "uploadForm") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = event.target;
  const status = document.querySelector("#uploadStatus");
  const button = document.querySelector("#submitUploadButton");
  const values = new FormData(form);
  const file = values.get("file");
  if (!file?.size || file.size > 25 * 1024 * 1024) {
    status.textContent = "Choose a file up to 25 MB.";
    status.className = "status error";
    return;
  }
  if ([".exe", ".com", ".bat", ".cmd", ".msi", ".app", ".dmg", ".apk", ".js", ".html", ".php", ".sh"].some((ext) => file.name.toLowerCase().endsWith(ext))) {
    status.textContent = "Executable and script files are not allowed.";
    status.className = "status error";
    return;
  }

  button.disabled = true;
  status.textContent = "Uploading privately for safety checks…";
  status.className = "status";
  try {
    const client = await getModerationClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) throw new Error("Please sign in before uploading.");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const stagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage.from("assets-staging").upload(stagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;

    status.textContent = "Checking title, description, and image for inappropriate content…";
    const { data, error } = await client.functions.invoke("moderate-asset", {
      body: {
        action: "submit",
        stage_path: stagePath,
        title: String(values.get("title") || "").trim(),
        description: String(values.get("description") || "").trim(),
        category: String(values.get("category") || "other"),
        file_name: file.name,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
      },
    });
    if (error) {
      await client.storage.from("assets-staging").remove([stagePath]);
      throw new Error(error.message || "The moderation service could not be reached.");
    }
    if (data?.status === "pending") {
      status.textContent = "This upload was flagged for a human review. It is not published yet.";
    } else {
      status.textContent = "Safety check passed. Your asset is published.";
    }
    status.className = "status";
    form.reset();
    setTimeout(() => { document.querySelector("#uploadDialog").close(); location.reload(); }, 1200);
  } catch (error) {
    console.error("Moderated upload failed", error);
    status.textContent = error.message || "Upload failed. Please try again later.";
    status.className = "status error";
  } finally {
    button.disabled = false;
  }
}, true);

// Show the human-review queue to admins when they open the moderation tab.
document.addEventListener("click", (event) => {
  if (event.target.closest('#moderationTab,[data-view="moderation"]')) {
    setTimeout(renderModerationQueue, 100);
  }
});

async function renderModerationQueue() {
  const grid = document.querySelector("#assetGrid");
  if (!grid || document.querySelector("#moderationTab")?.hidden) return;
  try {
    const client = await getModerationClient();
    const { data, error } = await client.from("assets").select("id,title,description,file_type,moderation_categories,created_at").eq("status", "pending").order("created_at", { ascending: true });
    if (error) throw error;
    grid.innerHTML = (data || []).map((asset) => {
      const categories = Object.keys(asset.moderation_categories || {}).filter((key) => asset.moderation_categories[key]);
      return `<article class="report-card"><h3>${escapeHtml(asset.title)}</h3><p>${escapeHtml(asset.description || "No description")}</p><p class="form-note">Flagged categories: ${escapeHtml(categories.join(", ") || "AI review required")}</p><div class="asset-actions"><button class="small-button" data-ai-review="approve" data-id="${escapeHtml(asset.id)}">Approve</button><button class="small-button danger" data-ai-review="reject" data-id="${escapeHtml(asset.id)}">Reject</button></div></article>`;
    }).join("") || "<p>No uploads are waiting for review.</p>";
  } catch (error) {
    grid.innerHTML = `<p>Could not load the AI review queue: ${escapeHtml(error.message)}</p>`;
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-ai-review]");
  if (!button) return;
  button.disabled = true;
  try {
    const client = await getModerationClient();
    const { error } = await client.functions.invoke("moderate-asset", { body: { action: "review", asset_id: button.dataset.id, decision: button.dataset.aiReview } });
    if (error) throw error;
    await renderModerationQueue();
  } catch (error) {
    button.disabled = false;
    alert(`Review action failed: ${error.message}`);
  }
});

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
