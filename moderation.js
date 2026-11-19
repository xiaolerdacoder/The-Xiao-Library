// Adds moderation to the existing upload flow without exposing the OpenAI key.
// This function checks the user-provided title and description (not the uploaded media).
const SUPABASE_URL = "https://vurrpxjvogadkrrmwboi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__WzgG2B_nLMa3tg7CbvXNw_1r6NqvL2";
const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
const moderationClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const uploadForm = document.querySelector("#uploadForm");
const uploadStatus = document.querySelector("#uploadStatus");
if (uploadForm) {
  let approvedRetry = false;

  uploadForm.addEventListener("submit", async (event) => {
    if (approvedRetry) {
      approvedRetry = false;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const title = new FormData(uploadForm).get("title")?.toString().trim() || "";
    const description = new FormData(uploadForm).get("description")?.toString().trim() || "";
    const submitButton = document.querySelector("#submitUploadButton");
    if (submitButton) submitButton.disabled = true;
    uploadStatus.textContent = "Checking title and description…";
    uploadStatus.className = "status";

    try {
      const { data, error } = await moderationClient.functions.invoke("moderate-upload", {
        body: { text: `Title: ${title}\nDescription: ${description}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.results?.[0]?.flagged) {
        uploadStatus.textContent = "This title or description needs review and was not uploaded.";
        uploadStatus.className = "status error";
        return;
      }

      // Re-dispatch the form submit so the app's normal upload handler runs only after approval.
      approvedRetry = true;
      uploadForm.requestSubmit(submitButton || undefined);
    } catch (error) {
      console.error("Upload moderation failed", error);
      uploadStatus.textContent = `Could not check this upload: ${error.message || "Moderation service unavailable"}. Please try again later.`;
      uploadStatus.className = "status error";
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }, true);
}

// Sound/video controls inside the card preview should play instead of opening the asset dialog.
const assetGrid = document.querySelector("#assetGrid");
assetGrid?.addEventListener("click", (event) => {
  if (event.target.closest("audio, video")) event.stopPropagation();
}, true);
assetGrid?.addEventListener("keydown", (event) => {
  if (event.target.closest("audio, video")) event.stopPropagation();
}, true);
