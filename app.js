// TXL uses a browser-safe Supabase publishable key. Never put a service-role key here.
const SUPABASE_URL = "https://vurrpxjvogadkrrmwboi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__WzgG2B_nLMa3tg7CbvXNw_1r6NqvL2";
const $ = (selector) => document.querySelector(selector);
const demoAssets = [
  { id: "demo-1", title: "Purple wizard", description: "A small fantasy character sprite.", category: "sprite", file_type: "image/png", file_name: "wizard.png", file_url: "", created_at: new Date().toISOString() },
  { id: "demo-2", title: "Forest ambience", description: "Birds, wind, and distant leaves.", category: "sound", file_type: "audio/mpeg", file_name: "forest.mp3", file_url: "", created_at: new Date().toISOString() },
  { id: "demo-3", title: "Blue sky", description: "A wide sky photograph for a level background.", category: "photo", file_type: "image/jpeg", file_name: "sky.jpg", file_url: "", created_at: new Date().toISOString() },
];
let supabase = null;
let assets = [...demoAssets];
let currentUser = null;
let profile = null;
let favoriteIds = new Set();
let collections = [];
let activeView = "explore";
let page = 1;
let selectedAsset = null;
let collectionAssetId = null;
let collectionAssetIds = null;
const PAGE_SIZE = 12;
const params = new URLSearchParams(location.search);
const publicProfileId = params.get("profile");
const publicCollectionId = params.get("collection");

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function showStatus(message, error = false) { const el = $("#appStatus"); el.textContent = message; el.classList.toggle("error", error); }
function setView(view) {
  activeView = view; page = 1;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  const titles = { explore: "Latest assets", favorites: "Your favorites", uploads: "Your uploads", collections: "Your collections", moderation: "Moderation queue" };
  $("#libraryHeading").textContent = titles[view] || titles.explore;
  $("#sectionEyebrow").textContent = view === "explore" ? "Explore" : "Your library";
  $("#collectionsPanel").hidden = view !== "collections";
  if (view === "collections") renderCollections();
  if (view === "moderation") loadReports();
  renderAssets();
}
function filePreview(asset) {
  const url = escapeHtml(asset.file_url);
  if (asset.file_type?.startsWith("image/") && url) return `<img src="${url}" alt="${escapeHtml(asset.title)}" loading="lazy">`;
  if (asset.file_type?.startsWith("video/") && url) return `<video src="${url}" controls preload="metadata"></video>`;
  if (asset.file_type?.startsWith("audio/") && url) return `<audio src="${url}" controls preload="metadata"></audio>`;
  return `<span class="asset-preview-icon" aria-hidden="true">${({ sprite: "◆", sound: "♫", photo: "◉", video: "▶", other: "▦" })[asset.category] || "▦"}</span>`;
}
function filteredAssets() {
  const search = $("#searchInput").value.trim().toLowerCase();
  const category = $("#categoryFilter").value;
  let rows = assets.filter((a) => (category === "all" || a.category === category) && `${a.title} ${a.description || ""} ${a.file_name || ""}`.toLowerCase().includes(search));
  if (publicProfileId) rows = rows.filter((a) => a.uploader_id === publicProfileId);
  else if (publicCollectionId && collectionAssetIds) rows = rows.filter((a) => collectionAssetIds.includes(a.id));
  else if (activeView === "favorites") rows = rows.filter((a) => favoriteIds.has(a.id));
  else if (activeView === "uploads") rows = rows.filter((a) => a.uploader_id === currentUser?.id);
  else if (activeView === "collections" || activeView === "moderation") rows = [];
  const sort = $("#sortSelect").value;
  rows.sort((a, b) => sort === "oldest" ? new Date(a.created_at) - new Date(b.created_at) : sort === "title" ? a.title.localeCompare(b.title) : sort === "smallest" ? (a.file_size || 0) - (b.file_size || 0) : new Date(b.created_at) - new Date(a.created_at));
  return rows;
}
function renderAssets() {
  const grid = $("#assetGrid");
  const rows = filteredAssets();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  page = Math.min(page, pages);
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  grid.innerHTML = visible.map((asset) => `
    <article class="asset-card"><button class="preview-button" data-action="view" data-id="${escapeHtml(asset.id)}" aria-label="Preview ${escapeHtml(asset.title)}"><div class="asset-preview">${filePreview(asset)}</div></button>
      <div class="asset-body"><h3 class="asset-title">${escapeHtml(asset.title)}</h3><p class="asset-description">${escapeHtml(asset.description || "Community asset")}</p>
        <div class="asset-meta"><span>${escapeHtml(asset.category)}</span><button class="text-button" data-action="uploader" data-id="${escapeHtml(asset.uploader_id || "")}">Uploader</button></div>
        <div class="asset-actions"><button class="small-button" data-action="favorite" data-id="${escapeHtml(asset.id)}" ${!currentUser ? 'title="Sign in to favorite"' : ""}>${favoriteIds.has(asset.id) ? "♥ Saved" : "♡ Favorite"}</button><button class="small-button" data-action="view" data-id="${escapeHtml(asset.id)}">Preview</button>
        ${asset.file_url ? `<a class="small-button" href="${escapeHtml(asset.file_url)}" target="_blank" rel="noopener" download>Save</a><button class="small-button" data-action="copy" data-id="${escapeHtml(asset.id)}">Copy link</button>` : ""}<button class="small-button" data-action="collect" data-id="${escapeHtml(asset.id)}">＋ Collection</button></div>
      </div></article>`).join("");
  $("#emptyMessage").hidden = visible.length > 0;
  $("#emptyMessage").textContent = rows.length ? "No assets match your search." : activeView === "favorites" ? "You have not favorited any assets yet." : activeView === "uploads" ? "You have not uploaded any assets yet." : "No assets here yet.";
  $("#pageLabel").textContent = `Page ${page} of ${pages}`;
  $("#prevPage").disabled = page <= 1; $("#nextPage").disabled = page >= pages;
}
async function loadAssets() {
  if (!supabase) return;
  const { data, error } = await supabase.from("assets").select("*").order("created_at", { ascending: false });
  if (error) { console.error(error); showStatus(`Could not load assets: ${error.message}`, true); return; }
  assets = data || []; renderAssets();
}
async function loadAccountData() {
  if (!supabase || !currentUser) return;
  const [{ data: favs, error: favError }, { data: prof }, { data: cols }] = await Promise.all([
    supabase.from("favorites").select("asset_id").eq("user_id", currentUser.id),
    supabase.from("profiles").select("id, username, avatar_url, role").eq("id", currentUser.id).maybeSingle(),
    supabase.from("collections").select("id, name, is_public").eq("owner_id", currentUser.id).order("created_at", { ascending: false }),
  ]);
  if (favError) console.warn("Favorites table unavailable; apply setup.sql", favError);
  favoriteIds = new Set((favs || []).map((r) => r.asset_id)); profile = prof || null; collections = cols || [];
  $("#moderationTab").hidden = profile?.role !== "admin";
  const name = profile?.username || currentUser.email?.split("@")[0] || "My profile";
  $("#profileButtonName").textContent = name;
  if (profile?.avatar_url) { $("#profileButtonAvatar").src = profile.avatar_url; $("#profileButtonAvatar").hidden = false; }
  renderAssets();
}
async function initialize() {
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await loadAssets();
    const { data } = await supabase.auth.getUser(); currentUser = data.user;
    $("#authButton").textContent = currentUser ? "Sign out" : "Sign in";
    $("#profileButton").hidden = !currentUser;
    if (currentUser) await loadAccountData();
    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      $("#authButton").textContent = currentUser ? "Sign out" : "Sign in";
      $("#profileButton").hidden = !currentUser;
      if (currentUser) loadAccountData(); else { favoriteIds.clear(); profile = null; collections = []; $("#moderationTab").hidden = true; renderAssets(); }
    });
    if (publicProfileId) await showPublicProfile(publicProfileId);
    if (publicCollectionId) await showPublicCollection(publicCollectionId);
  } catch (error) {
    console.error("Supabase initialization failed", error);
    showStatus("Supabase could not connect. Check your connection and Supabase setup.", true);
  }
}
async function showPublicProfile(id) {
  const { data } = await supabase.from("profiles").select("username, avatar_url").eq("id", id).maybeSingle();
  const banner = $("#profileBanner"); banner.hidden = false;
  banner.innerHTML = `<h2>${escapeHtml(data?.username || "TXL member")}</h2><p>Public profile · <a href="./">Back to library</a></p>`;
  $("#libraryHeading").textContent = "Shared uploads";
}
async function showPublicCollection(id) {
  const { data: col } = await supabase.from("collections").select("id,name,owner_id,is_public").eq("id", id).eq("is_public", true).maybeSingle();
  if (!col) { showStatus("That collection is unavailable or private.", true); return; }
  const { data: links } = await supabase.from("collection_assets").select("asset_id").eq("collection_id", id);
  collectionAssetIds = (links || []).map((x) => x.asset_id);
  $("#libraryHeading").textContent = col.name; $("#profileBanner").hidden = false;
  $("#profileBanner").innerHTML = `<h2>${escapeHtml(col.name)}</h2><p>Public collection · <a href="./">Back to library</a></p>`;
  renderAssets();
}
function showDialog(id) { $("#" + id).showModal(); }
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $("#" + button.dataset.close).close()));
$("#authButton").addEventListener("click", async () => {
  if (currentUser) { await supabase.auth.signOut(); return; }
  showDialog("authDialog");
});
$("#profileButton").addEventListener("click", async () => {
  if (!currentUser) return;
  $("#profileStatus").textContent = "";
  const fallback = currentUser.email?.split("@")[0] || "library_user";
  $("#usernameInput").value = profile?.username || fallback.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 24);
  $("#avatarInput").value = ""; showProfileImage(profile?.avatar_url || ""); showDialog("profileDialog");
});
$("#openUploadButton").addEventListener("click", () => currentUser ? showDialog("uploadDialog") : showDialog("authDialog"));
$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const email = new FormData(event.currentTarget).get("email");
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
  $("#authStatus").textContent = error?.message || "Check your email for a secure sign-in link.";
  $("#authStatus").classList.toggle("error", !!error);
});
function showProfileImage(url) { const img = $("#profilePreview"), placeholder = $("#profilePlaceholder"); if (url) { img.src = url; img.hidden = false; placeholder.hidden = true; } else { img.removeAttribute("src"); img.hidden = true; placeholder.hidden = false; } }
$("#avatarInput").addEventListener("change", (e) => { const f = e.currentTarget.files[0]; if (f?.type.startsWith("image/")) showProfileImage(URL.createObjectURL(f)); });
$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = $("#saveProfileButton"), status = $("#profileStatus"), username = $("#usernameInput").value.trim(), file = $("#avatarInput").files[0];
  if (!/^[A-Za-z0-9_-]{3,24}$/.test(username)) { status.textContent = "Use 3–24 letters, numbers, underscores, or hyphens."; status.className = "status error"; return; }
  button.disabled = true; status.textContent = "Saving…"; status.className = "status";
  let avatar_url = profile?.avatar_url || null;
  if (file) {
    if (!/^(image\/png|image\/jpeg|image\/gif|image\/webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) { status.textContent = "Choose a PNG, JPG, GIF, or WebP image up to 5 MB."; status.className = "status error"; button.disabled = false; return; }
    const path = `${currentUser.id}/${crypto.randomUUID()}.${file.name.split(".").pop().replace(/[^a-z0-9]/gi, "")}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
    if (error) { status.textContent = error.message; status.className = "status error"; button.disabled = false; return; }
    avatar_url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }
  const { data, error } = await supabase.from("profiles").upsert({ id: currentUser.id, username, avatar_url }).select("id,username,avatar_url,role").single();
  if (error) { status.textContent = error.message; status.className = "status error"; button.disabled = false; return; }
  profile = data; await loadAccountData(); status.textContent = "Profile saved!"; button.disabled = false; setTimeout(() => $("#profileDialog").close(), 500);
});
$("#uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget, status = $("#uploadStatus"), button = $("#submitUploadButton"), values = new FormData(form), file = values.get("file");
  if (!file?.size || file.size > 25 * 1024 * 1024) { status.textContent = "Choose a file up to 25 MB."; status.className = "status error"; return; }
  if ([".exe", ".com", ".bat", ".cmd", ".msi", ".app", ".dmg", ".apk", ".js", ".html", ".php", ".sh"].some((ext) => file.name.toLowerCase().endsWith(ext))) { status.textContent = "Executable and script files are not allowed."; status.className = "status error"; return; }
  button.disabled = true; status.textContent = "Uploading…"; status.className = "status";
  const path = `${currentUser.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const { error: upErr } = await supabase.storage.from("assets").upload(path, file, { contentType: file.type });
  if (upErr) { status.textContent = upErr.message; status.className = "status error"; button.disabled = false; return; }
  const file_url = supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from("assets").insert({ title: values.get("title"), description: values.get("description"), category: values.get("category"), file_name: file.name, file_type: file.type || "application/octet-stream", file_size: file.size, file_url, uploader_id: currentUser.id });
  if (error) { status.textContent = error.message; status.className = "status error"; } else { status.textContent = "Upload complete!"; form.reset(); await loadAssets(); setView("uploads"); setTimeout(() => $("#uploadDialog").close(), 500); }
  button.disabled = false;
});
async function toggleFavorite(id) {
  if (!currentUser) { showDialog("authDialog"); return; }
  if (favoriteIds.has(id)) { const { error } = await supabase.from("favorites").delete().eq("user_id", currentUser.id).eq("asset_id", id); if (error) return showStatus(error.message, true); favoriteIds.delete(id); }
  else { const { error } = await supabase.from("favorites").insert({ user_id: currentUser.id, asset_id: id }); if (error) return showStatus(error.message, true); favoriteIds.add(id); }
  renderAssets();
}
async function copyAssetLink(asset) {
  const text = asset.file_url || `${location.origin}${location.pathname}?asset=${encodeURIComponent(asset.id)}`;
  try { await navigator.clipboard.writeText(text); showStatus("Link copied to clipboard."); }
  catch { window.prompt("Copy this link:", text); }
}
async function saveAsset(asset) {
  if (!asset.file_url) return;
  try { const response = await fetch(asset.file_url); if (!response.ok) throw new Error("Download unavailable"); const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = asset.file_name || asset.title; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
  catch { window.open(asset.file_url, "_blank", "noopener"); }
}
async function openAsset(asset) {
  selectedAsset = asset;
  $("#detailTitle").textContent = asset.title; $("#detailDescription").textContent = asset.description || "Community asset";
  $("#detailPreview").innerHTML = filePreview(asset);
  $("#detailUploader").innerHTML = asset.uploader_id ? `Uploaded by <a href="?profile=${encodeURIComponent(asset.uploader_id)}">view profile</a>` : "Example asset";
  $("#detailActions").innerHTML = `${asset.file_url ? `<button class="small-button" data-detail-action="save">Save to device</button><button class="small-button" data-detail-action="copy">Copy link</button>` : ""}<button class="small-button" data-detail-action="favorite">${favoriteIds.has(asset.id) ? "♥ Remove favorite" : "♡ Favorite"}</button><button class="small-button" data-detail-action="collect">＋ Collection</button><button class="small-button" data-detail-action="report">Report</button>`;
  await loadComments(asset.id); showDialog("detailDialog");
}
async function loadComments(assetId) {
  const box = $("#commentsList"); box.innerHTML = "<p class='form-note'>Loading comments…</p>";
  const { data, error } = await supabase.from("comments").select("id,body,created_at,user_id,profiles(username)").eq("asset_id", assetId).order("created_at", { ascending: true });
  if (error) { box.innerHTML = "<p class='form-note'>Comments are unavailable until the database setup is applied.</p>"; return; }
  box.innerHTML = (data || []).map((c) => `<article class="comment"><strong>${escapeHtml(c.profiles?.username || "TXL member")}</strong><p>${escapeHtml(c.body)}</p>${c.user_id === currentUser?.id ? `<button class="text-button" data-delete-comment="${escapeHtml(c.id)}">Delete</button>` : ""}</article>`).join("") || "<p class='form-note'>No comments yet.</p>";
}
$("#commentForm").addEventListener("submit", async (event) => {
  event.preventDefault(); if (!currentUser) { showDialog("authDialog"); return; }
  const body = $("#commentInput").value.trim(); if (!body || !selectedAsset) return;
  const { error } = await supabase.from("comments").insert({ asset_id: selectedAsset.id, user_id: currentUser.id, body });
  $("#commentStatus").textContent = error?.message || "Comment posted."; $("#commentStatus").classList.toggle("error", !!error);
  if (!error) { $("#commentInput").value = ""; await loadComments(selectedAsset.id); }
});
$("#avatarInput");
$("#assetGrid").addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]"); if (!target) return;
  const asset = assets.find((a) => a.id === target.dataset.id); if (!asset && target.dataset.action !== "uploader") return;
  if (target.dataset.action === "view") await openAsset(asset);
  if (target.dataset.action === "favorite") await toggleFavorite(asset.id);
  if (target.dataset.action === "copy") await copyAssetLink(asset);
  if (target.dataset.action === "collect") { if (!currentUser) return showDialog("authDialog"); collectionAssetId = asset.id; await renderCollectionChoices(); showDialog("collectionDialog"); }
  if (target.dataset.action === "uploader" && target.dataset.id) location.href = `?profile=${encodeURIComponent(target.dataset.id)}`;
});
$("#detailActions").addEventListener("click", async (event) => {
  const action = event.target.dataset.detailAction; if (!action || !selectedAsset) return;
  if (action === "favorite") { await toggleFavorite(selectedAsset.id); $("#detailActions").querySelector('[data-detail-action="favorite"]').textContent = favoriteIds.has(selectedAsset.id) ? "♥ Remove favorite" : "♡ Favorite"; }
  if (action === "save") await saveAsset(selectedAsset);
  if (action === "copy") await copyAssetLink(selectedAsset);
  if (action === "collect") { if (!currentUser) return showDialog("authDialog"); collectionAssetId = selectedAsset.id; await renderCollectionChoices(); showDialog("collectionDialog"); }
  if (action === "report") { if (!currentUser) return showDialog("authDialog"); const reason = prompt("Why are you reporting this asset?"); if (reason?.trim()) { const { error } = await supabase.from("reports").insert({ asset_id: selectedAsset.id, reporter_id: currentUser.id, reason: reason.trim() }); showStatus(error ? error.message : "Report sent for review.", !!error); } }
});
$("#commentsList").addEventListener("click", async (event) => { const id = event.target.dataset.deleteComment; if (!id || !confirm("Delete your comment?")) return; const { error } = await supabase.from("comments").delete().eq("id", id); if (error) showStatus(error.message, true); else await loadComments(selectedAsset.id); });
async function renderCollectionChoices() {
  const { data } = await supabase.from("collections").select("id,name,is_public").eq("owner_id", currentUser.id).order("created_at", { ascending: false }); collections = data || [];
  $("#collectionChoices").innerHTML = collections.map((c) => `<button type="button" class="collection-choice" data-collection-id="${escapeHtml(c.id)}">＋ ${escapeHtml(c.name)}${c.is_public ? " · public" : ""}</button>`).join("") || "<p class='form-note'>Create a collection first.</p>";
}
$("#createCollectionButton").addEventListener("click", async () => {
  const name = $("#newCollectionName").value.trim(); if (!name) return;
  const { data, error } = await supabase.from("collections").insert({ owner_id: currentUser.id, name }).select("id,name,is_public").single();
  $("#collectionStatus").textContent = error?.message || "Collection created."; $("#collectionStatus").classList.toggle("error", !!error);
  if (data) { collections.unshift(data); $("#newCollectionName").value = ""; await renderCollectionChoices(); }
});
$("#collectionChoices").addEventListener("click", async (event) => {
  const id = event.target.dataset.collectionId; if (!id) return;
  const { error } = await supabase.from("collection_assets").insert({ collection_id: id, asset_id: collectionAssetId });
  $("#collectionStatus").textContent = error?.code === "23505" ? "Already in that collection." : error?.message || "Added to collection.";
  $("#collectionStatus").classList.toggle("error", !!error && error.code !== "23505");
});
async function renderCollections() {
  if (!currentUser) { $("#collectionsPanel").innerHTML = "<p>Sign in to create collections.</p>"; return; }
  const { data, error } = await supabase.from("collections").select("id,name,is_public,created_at").eq("owner_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { $("#collectionsPanel").innerHTML = "<p>Apply the database setup to enable collections.</p>"; return; }
  collections = data || [];
  $("#collectionsPanel").innerHTML = `<button class="button button-primary" id="newCollectionFromTab">＋ New collection</button><div class="collection-list">${collections.map((c) => `<article class="collection-card"><h3>${escapeHtml(c.name)}</h3><p>${c.is_public ? "Public" : "Private"} · <a href="?collection=${encodeURIComponent(c.id)}">Open collection</a></p><button class="small-button" data-toggle-public="${escapeHtml(c.id)}" data-public="${c.is_public}">${c.is_public ? "Make private" : "Make public"}</button></article>`).join("") || "<p>No collections yet. Create one from an asset card.</p>"}</div>`;
  $("#newCollectionFromTab").addEventListener("click", async () => { const name = prompt("Collection name?"); if (!name?.trim()) return; const { error } = await supabase.from("collections").insert({ owner_id: currentUser.id, name: name.trim() }); if (error) showStatus(error.message, true); else renderCollections(); });
}
$("#collectionsPanel").addEventListener("click", async (event) => { const id = event.target.dataset.togglePublic; if (!id) return; const is_public = event.target.dataset.public !== "true"; const { error } = await supabase.from("collections").update({ is_public }).eq("id", id); if (error) showStatus(error.message, true); else renderCollections(); });
async function loadReports() {
  const { data, error } = await supabase.from("reports").select("id,reason,created_at,asset_id,assets(title,file_url)").order("created_at", { ascending: true });
  $("#assetGrid").innerHTML = error ? "<p>Moderation queue is unavailable.</p>" : (data || []).map((r) => `<article class="report-card"><h3>${escapeHtml(r.assets?.title || "Removed asset")}</h3><p>${escapeHtml(r.reason)}</p><a href="${escapeHtml(r.assets?.file_url || "#")}" target="_blank" rel="noopener">View asset</a><div class="asset-actions"><button class="small-button" data-report-dismiss="${escapeHtml(r.id)}">Dismiss</button><button class="small-button danger" data-report-delete="${escapeHtml(r.id)}" data-asset="${escapeHtml(r.asset_id)}">Remove asset</button></div></article>`).join("") || "<p>No reports to review.</p>";
}
$("#assetGrid").addEventListener("click", async (event) => {
  const dismiss = event.target.dataset.reportDismiss, remove = event.target.dataset.reportDelete;
  if (dismiss) { const { error } = await supabase.from("reports").delete().eq("id", dismiss); if (error) showStatus(error.message, true); else loadReports(); }
  if (remove) { if (!confirm("Permanently remove this asset and its reports?")) return; const assetId = event.target.dataset.asset; const { error } = await supabase.from("assets").delete().eq("id", assetId); if (error) showStatus(error.message, true); else { await supabase.from("reports").delete().eq("asset_id", assetId); await loadAssets(); loadReports(); } }
});
$("#searchInput").addEventListener("input", () => { page = 1; renderAssets(); });
$("#categoryFilter").addEventListener("change", () => { page = 1; renderAssets(); });
$("#sortSelect").addEventListener("change", () => { page = 1; renderAssets(); });
$("#prevPage").addEventListener("click", () => { page--; renderAssets(); });
$("#nextPage").addEventListener("click", () => { page++; renderAssets(); });
$("#libraryTabs").addEventListener("click", (event) => { const view = event.target.dataset.view; if (view && !event.target.hidden) setView(view); });
initialize();
renderAssets();
