// Xiaoler starts with a demo library when Supabase is not configured.
// Add the Supabase Project URL and anon public key here to enable accounts/uploads.
const SUPABASE_URL = "https://vurrpxjvogadkrrmwboi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SikXBjP_sMk3TbkStBegUA_MzG7a1eF";

const $ = (selector) => document.querySelector(selector);
const assetGrid = $("#assetGrid");
const emptyMessage = $("#emptyMessage");
const searchInput = $("#searchInput");
const categoryFilter = $("#categoryFilter");

const demoAssets = [
  { title: "Purple wizard", description: "A small fantasy character sprite.", category: "sprite", file_type: "image/png", file_name: "wizard.png", file_url: "" },
  { title: "Forest ambience", description: "Birds, wind, and distant leaves.", category: "sound", file_type: "audio/mpeg", file_name: "forest.mp3", file_url: "" },
  { title: "Blue sky", description: "A wide sky photograph for a level background.", category: "photo", file_type: "image/jpeg", file_name: "sky.jpg", file_url: "" },
];

let supabase = null;
let currentAssets = [...demoAssets];
let currentUser = null;
let currentProfile = null;

async function initializeSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const module = await import("https://esm.sh/@supabase/supabase-js@2");
  supabase = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await loadAssets();
  const { data } = await supabase.auth.getUser();
  currentUser = data.user;
  await refreshAccountUI();

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    currentProfile = null;
    refreshAccountUI();
  });
}

async function loadAssets() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  currentAssets = data;
  renderAssets();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function previewFor(asset) {
  const type = asset.file_type || "";
  const url = escapeHtml(asset.file_url);

  if (type.startsWith("image/") && url) return `<img src="${url}" alt="${escapeHtml(asset.title)}" loading="lazy">`;
  if (type.startsWith("video/") && url) return `<video src="${url}" controls preload="metadata"></video>`;
  if (type.startsWith("audio/") && url) return `<audio src="${url}" controls preload="metadata"></audio>`;

  const icons = { sprite: "◆", sound: "♫", photo: "◉", video: "▶", other: "▦" };
  return `<span class="asset-preview-icon" aria-hidden="true">${icons[asset.category] || "▦"}</span>`;
}

function renderAssets() {
  const search = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const matches = currentAssets.filter((asset) => {
    const categoryMatches = category === "all" || asset.category === category;
    const text = `${asset.title} ${asset.description || ""} ${asset.file_name || ""}`.toLowerCase();
    return categoryMatches && text.includes(search);
  });

  assetGrid.innerHTML = matches.map((asset) => `
    <article class="asset-card">
      <div class="asset-preview">${previewFor(asset)}</div>
      <div class="asset-body">
        <h3 class="asset-title" title="${escapeHtml(asset.title)}">${escapeHtml(asset.title)}</h3>
        <p class="asset-description">${escapeHtml(asset.description || "Community asset")}</p>
        <div class="asset-meta">
          <span>${escapeHtml(asset.category)}</span>
          ${asset.file_url ? `<a class="asset-link" href="${escapeHtml(asset.file_url)}" target="_blank" rel="noopener">Download</a>` : "<span>Example</span>"}
        </div>
      </div>
    </article>
  `).join("");

  emptyMessage.hidden = matches.length !== 0;
}

searchInput.addEventListener("input", renderAssets);
categoryFilter.addEventListener("change", renderAssets);

const uploadDialog = $("#uploadDialog");
const authDialog = $("#authDialog");
const profileDialog = $("#profileDialog");

$("#openUploadButton").addEventListener("click", async () => {
  if (!supabase) {
    alert("Accounts and uploads need Supabase setup first. See README.md for instructions.");
    return;
  }

  if (!currentUser) authDialog.showModal();
  else uploadDialog.showModal();
});

$("#closeUploadButton").addEventListener("click", () => uploadDialog.close());
$("#closeAuthButton").addEventListener("click", () => authDialog.close());
$("#closeProfileButton").addEventListener("click", () => profileDialog.close());
$("#authButton").addEventListener("click", async () => {
  if (!supabase) {
    alert("Accounts and profiles need Supabase setup first. See README.md for instructions.");
  } else if (currentUser) {
    await supabase.auth.signOut();
  } else {
    authDialog.showModal();
  }
});

$("#profileButton").addEventListener("click", async () => {
  if (!currentUser) return;
  await openProfileEditor();
});

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = new FormData(event.currentTarget).get("email");
  const status = $("#authStatus");
  status.className = "status";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });

  if (error) {
    status.textContent = error.message;
    status.className = "status error";
  } else {
    status.textContent = "Check your email for a secure sign-in link.";
  }
});

async function refreshAccountUI() {
  const authButton = $("#authButton");
  const profileButton = $("#profileButton");
  authButton.textContent = currentUser ? "Sign out" : "Sign in";
  profileButton.hidden = !currentUser;

  if (!currentUser) {
    currentProfile = null;
    return;
  }

  await loadProfile();
  const name = currentProfile?.username || currentUser.email?.split("@")[0] || "My profile";
  $("#profileButtonName").textContent = name;
  const avatar = $("#profileButtonAvatar");
  if (currentProfile?.avatar_url) {
    avatar.src = currentProfile.avatar_url;
    avatar.hidden = false;
  } else {
    avatar.removeAttribute("src");
    avatar.hidden = true;
  }
}

async function loadProfile() {
  if (!supabase || !currentUser) return;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Could not load profile:", error);
    currentProfile = null;
    return;
  }
  currentProfile = data;
}

async function openProfileEditor() {
  const status = $("#profileStatus");
  status.textContent = "";
  status.className = "status";
  await loadProfile();

  const fallbackName = currentUser.email?.split("@")[0] || "new_library_user";
  $("#usernameInput").value = currentProfile?.username || fallbackName.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 24);
  $("#avatarInput").value = "";
  showProfileImage(currentProfile?.avatar_url || "");
  profileDialog.showModal();
}

function showProfileImage(url) {
  const image = $("#profilePreview");
  const placeholder = $("#profilePlaceholder");
  if (url) {
    image.src = url;
    image.hidden = false;
    placeholder.hidden = true;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    placeholder.hidden = false;
  }
}

$("#avatarInput").addEventListener("change", (event) => {
  const file = event.currentTarget.files[0];
  if (!file) {
    showProfileImage(currentProfile?.avatar_url || "");
    return;
  }
  if (!file.type.startsWith("image/")) return;
  showProfileImage(URL.createObjectURL(file));
});

$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) return;

  const form = event.currentTarget;
  const saveButton = $("#saveProfileButton");
  const status = $("#profileStatus");
  const username = $("#usernameInput").value.trim();
  const avatarFile = $("#avatarInput").files[0];

  if (!/^[A-Za-z0-9_-]{3,24}$/.test(username)) {
    status.textContent = "Use 3–24 letters, numbers, underscores, or hyphens for your username.";
    status.className = "status error";
    return;
  }
  if (avatarFile && !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(avatarFile.type)) {
    status.textContent = "Please choose a PNG, JPG, GIF, or WebP image.";
    status.className = "status error";
    return;
  }
  if (avatarFile && avatarFile.size > 5 * 1024 * 1024) {
    status.textContent = "Your profile picture must be 5 MB or smaller.";
    status.className = "status error";
    return;
  }

  saveButton.disabled = true;
  status.textContent = "Saving your profile...";
  status.className = "status";
  let avatarUrl = currentProfile?.avatar_url || null;

  if (avatarFile) {
    const safeExtension = avatarFile.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
    const avatarPath = `${currentUser.id}/${crypto.randomUUID()}.${safeExtension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(avatarPath, avatarFile, { contentType: avatarFile.type, upsert: false });

    if (uploadError) {
      status.textContent = uploadError.message;
      status.className = "status error";
      saveButton.disabled = false;
      return;
    }
    avatarUrl = supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl;
  }

  const { data, error } = await supabase.from("profiles").upsert({
    id: currentUser.id,
    username,
    avatar_url: avatarUrl,
  }).select("id, username, avatar_url").single();

  if (error) {
    status.textContent = error.message;
    status.className = "status error";
    saveButton.disabled = false;
    return;
  }

  currentProfile = data;
  await refreshAccountUI();
  status.textContent = "Profile saved!";
  form.reset();
  setTimeout(() => profileDialog.close(), 600);
  saveButton.disabled = false;
});

$("#uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = $("#submitUploadButton");
  const status = $("#uploadStatus");
  const values = new FormData(form);
  const file = values.get("file");

  if (!file || !file.size) {
    status.textContent = "Choose a file to upload.";
    status.className = "status error";
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    status.textContent = "That file is larger than 25 MB.";
    status.className = "status error";
    return;
  }

  const blockedExtensions = [".exe", ".com", ".bat", ".cmd", ".msi", ".app", ".dmg", ".apk", ".js", ".html", ".php", ".sh"];
  if (blockedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    status.textContent = "Executable and script files are not allowed.";
    status.className = "status error";
    return;
  }

  submitButton.disabled = true;
  status.textContent = "Uploading...";
  status.className = "status";

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    status.textContent = "Please sign in before uploading.";
    status.className = "status error";
    submitButton.disabled = false;
    return;
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${userData.user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    status.textContent = uploadError.message;
    status.className = "status error";
    submitButton.disabled = false;
    return;
  }

  const { data: publicUrl } = supabase.storage.from("assets").getPublicUrl(path);
  const { error: insertError } = await supabase.from("assets").insert({
    title: values.get("title"),
    description: values.get("description"),
    category: values.get("category"),
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    file_url: publicUrl.publicUrl,
  });

  if (insertError) {
    status.textContent = insertError.message;
    status.className = "status error";
  } else {
    status.textContent = "Upload complete!";
    form.reset();
    await loadAssets();
    setTimeout(() => uploadDialog.close(), 700);
  }
  submitButton.disabled = false;
});

initializeSupabase();
renderAssets();
