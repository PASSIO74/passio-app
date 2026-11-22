// Clés anon PUBLIQUES : mêmes droits que le visiteur. Aucun secret d’administration.
const PROD = Object.freeze({url:"https://njkiyoklssvefstljemx.supabase.co",anon:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qa2l5b2tsc3N2ZWZzdGxqZW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTc3MDQsImV4cCI6MjA5NDI3MzcwNH0.wbFAexVW75vlXZ7mRRxeZ28zKevOAYYe0lda0F22dTM"});
const STAGING = Object.freeze({url:"https://fcksxofaelcdmmifnwjo.supabase.co",anon:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZja3N4b2ZhZWxjZG1taWZud2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTIyNzksImV4cCI6MjEwMjUyODI3OX0.KS30NdnRXWHvD3LkR5DmbXTmsIcmS6hopLquc36HzyQ"});
export function cibleMedias(context) {
  const deploy = context && context.deploy;
  if (!deploy || typeof deploy.published !== "boolean" || !["production","deploy-preview","branch-deploy","dev"].includes(deploy.context)) return null;
  if (deploy.published === true) return deploy.context === "production" ? PROD : null;
  return STAGING;
}
