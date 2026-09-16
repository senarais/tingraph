import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATE_DIR = join(ROOT, "supabase", "templates");

/**
 * The copy and actions for every email Supabase Auth can send. The generated
 * HTML is deliberately table-based and fully inline: webmail, Outlook and
 * small screens should all get the same drafting-sheet hierarchy.
 */
const templates = [
  {
    key: "confirmation",
    file: "confirmation.html",
    subject: "Confirm your Tingraph account",
    sequence: "AUTH / 01",
    preheader: "Confirm your email address and finish creating your Tingraph account.",
    title: "Confirm your email.",
    body: "One click finishes your Tingraph account. After that, you can sign in and keep a profile alongside the diagrams you make.",
    action: {
      kind: "link",
      label: "Confirm email",
      href: "{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email",
    },
    caution: "If you did not create a Tingraph account, no action is needed.",
  },
  {
    key: "recovery",
    file: "recovery.html",
    subject: "Reset your Tingraph password",
    sequence: "AUTH / 02",
    preheader: "Use this secure link to choose a new password for your Tingraph account.",
    title: "Reset your password.",
    body: "We received a request to choose a new password for your Tingraph account.",
    action: {
      kind: "link",
      label: "Choose a new password",
      href: "{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery",
    },
    caution: "If you did not request a password reset, ignore this email. Your password will stay unchanged.",
  },
  {
    key: "invite",
    file: "invite.html",
    subject: "You're invited to Tingraph",
    sequence: "AUTH / 03",
    preheader: "Accept your invitation and create a Tingraph account.",
    title: "You are invited.",
    body: "Someone has invited you to Tingraph, a small language for drawing publication-ready diagrams.",
    action: {
      kind: "link",
      label: "Accept invitation",
      href: "{{ .ConfirmationURL }}",
    },
    caution: "If you were not expecting this invitation, you can safely ignore it.",
  },
  {
    key: "magic_link",
    file: "magic-link.html",
    subject: "Your Tingraph sign-in link",
    sequence: "AUTH / 04",
    preheader: "Use this one-time link to sign in to Tingraph.",
    title: "Sign in to Tingraph.",
    body: "Use the one-time link below to sign in. It may expire and can only be used once.",
    action: {
      kind: "link",
      label: "Sign in",
      href: "{{ .ConfirmationURL }}",
    },
    caution: "If you did not ask for a sign-in link, ignore this email.",
  },
  {
    key: "email_change",
    file: "email-change.html",
    subject: "Confirm your new Tingraph email",
    sequence: "AUTH / 05",
    preheader: "Confirm the new email address for your Tingraph account.",
    title: "Confirm your new email.",
    body: "Confirm the change from {{ .Email }} to {{ .NewEmail }} for your Tingraph account.",
    action: {
      kind: "link",
      label: "Confirm new email",
      href: "{{ .ConfirmationURL }}",
    },
    caution: "If you did not request this change, do not use the link and keep your current sign-in details private.",
  },
  {
    key: "reauthentication",
    file: "reauthentication.html",
    subject: "{{ .Token }} is your Tingraph verification code",
    sequence: "AUTH / 06",
    preheader: "Use this one-time code to verify your identity in Tingraph.",
    title: "Verify it is you.",
    body: "Enter this one-time code in Tingraph to continue the protected action.",
    action: {
      kind: "code",
      value: "{{ .Token }}",
    },
    caution: "Never share this code. If you did not request it, you can safely ignore this email.",
  },
];

function linkAction(action) {
  return `
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td align="left" style="padding:0 0 28px 0;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                              <tr>
                                <td bgcolor="#000000" style="border:2px solid #000000;box-shadow:4px 4px 0 #c8ccc5;">
                                  <a href="${action.href}" target="_blank" style="display:inline-block;padding:12px 18px;font-family:'Courier New',Courier,monospace;font-size:14px;line-height:20px;font-weight:700;color:#efede6;text-decoration:none;">${action.label} &rarr;</a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#565d64;">
                            Button not working? Copy and paste this address:
                          </td>
                        </tr>
                        <tr>
                          <td bgcolor="#f2f3f0" style="border:2px solid #000000;padding:12px;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:17px;color:#14171a;word-break:break-all;overflow-wrap:anywhere;">
                            <a href="${action.href}" target="_blank" style="color:#14171a;text-decoration:underline;">${action.href}</a>
                          </td>
                        </tr>
                      </table>`;
}

function codeAction(action) {
  return `
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td style="padding:0 0 8px 0;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#565d64;">
                            One-time code
                          </td>
                        </tr>
                        <tr>
                          <td align="center" bgcolor="#f2f3f0" style="border:2px solid #000000;padding:20px 12px;font-family:'Courier New',Courier,monospace;font-size:30px;line-height:38px;font-weight:700;letter-spacing:8px;color:#14171a;">
                            ${action.value}
                          </td>
                        </tr>
                      </table>`;
}

function render(template) {
  const action = template.action.kind === "link" ? linkAction(template.action) : codeAction(template.action);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>${template.subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#efede6;color:#14171a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">${template.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#efede6" style="width:100%;border-collapse:collapse;background-color:#efede6;">
      <tr>
        <td align="center" style="padding:36px 12px 44px 12px;">
          <!--[if mso]>
          <table role="presentation" width="608" cellspacing="0" cellpadding="0" border="0"><tr><td>
          <![endif]-->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#000000" style="width:100%;max-width:608px;border-collapse:separate;background-color:#000000;">
            <tr>
              <td style="padding:0 8px 8px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;border:2px solid #000000;border-collapse:collapse;background-color:#ffffff;">
                  <tr>
                    <td bgcolor="#efede6" style="border-bottom:2px solid #000000;padding:14px 18px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td width="24" valign="middle" style="width:24px;">
                            <table role="presentation" width="16" height="16" cellspacing="0" cellpadding="0" border="0" style="width:16px;height:16px;border:2px solid #000000;border-collapse:collapse;">
                              <tr><td style="font-size:1px;line-height:1px;">&nbsp;</td></tr>
                            </table>
                          </td>
                          <td valign="middle" style="font-family:'Courier New',Courier,monospace;font-size:15px;line-height:20px;font-weight:700;color:#14171a;">
                            tingraph
                          </td>
                          <td align="right" valign="middle" style="font-family:'Courier New',Courier,monospace;font-size:10px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;color:#565d64;">
                            ${template.sequence}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:34px 28px 32px 28px;">
                      <p style="margin:0 0 12px 0;font-family:'Courier New',Courier,monospace;font-size:10px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8b929a;">Account message</p>
                      <h1 style="margin:0 0 16px 0;font-family:'Courier New',Courier,monospace;font-size:28px;line-height:34px;letter-spacing:-1px;color:#14171a;">${template.title}</h1>
                      <p style="margin:0 0 26px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#565d64;">${template.body}</p>
${action}
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td style="padding:26px 0 0 0;">
                            <div style="border-top:2px solid #000000;font-size:1px;line-height:1px;">&nbsp;</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:18px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#565d64;">
                            ${template.caution}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#8b929a;">
                            This message concerns <span style="color:#565d64;">{{ .Email }}</span>.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
            <tr>
              <td align="center" style="padding:22px 12px 0 12px;font-family:'Courier New',Courier,monospace;font-size:10px;line-height:17px;letter-spacing:.6px;color:#565d64;">
                WRITE THE DIAGRAM. TINGRAPH DRAWS IT.<br>
                <a href="{{ .SiteURL }}" target="_blank" style="color:#14171a;text-decoration:underline;">Open Tingraph</a>
              </td>
            </tr>
          </table>
          <!--[if mso]>
          </td></tr></table>
          <![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

function validate(template, html) {
  const problems = [];
  if (!html.startsWith("<!doctype html>")) problems.push("missing doctype");
  if (!html.includes("role=\"presentation\"")) problems.push("missing presentation tables");
  if (!html.includes("{{ .Email }}")) problems.push("missing recipient context");
  if (!html.includes("{{ .SiteURL }}")) problems.push("missing site link");
  if (template.action.kind === "link" && !html.includes(`href=\"${template.action.href}\"`)) {
    problems.push("missing primary action link");
  }
  if (["confirmation", "recovery"].includes(template.key) && !html.includes("{{ .TokenHash }}")) {
    problems.push("missing cross-browser token hash");
  }
  if (template.key === "reauthentication" && !html.includes("{{ .Token }}")) {
    problems.push("missing one-time code");
  }
  if (Buffer.byteLength(html) > 100_000) problems.push("HTML exceeds 100 KB");
  if (problems.length) throw new Error(`${template.file}: ${problems.join(", ")}`);
}

async function generatedTemplates() {
  return Promise.all(
    templates.map(async (template) => {
      const html = render(template);
      validate(template, html);
      return { ...template, html, path: join(TEMPLATE_DIR, template.file) };
    }),
  );
}

async function writeTemplates(generated) {
  await mkdir(TEMPLATE_DIR, { recursive: true });
  await Promise.all(generated.map(({ path, html }) => writeFile(path, html, "utf8")));
  console.log(`Wrote ${generated.length} Tingraph auth email templates.`);
}

async function checkTemplates(generated) {
  const stale = [];
  for (const template of generated) {
    let current;
    try {
      current = await readFile(template.path, "utf8");
    } catch {
      stale.push(template.file);
      continue;
    }
    if (current !== template.html) stale.push(template.file);
  }
  if (stale.length) {
    throw new Error(`Generated auth email templates are missing or stale: ${stale.join(", ")}. Run npm run auth-emails:build.`);
  }
  console.log(`Checked ${generated.length} Tingraph auth email templates.`);
}

function argument(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefixed = process.argv.find((value) => value.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

async function projectRef() {
  const explicit = argument("--project-ref") ?? process.env.SUPABASE_PROJECT_REF;
  if (explicit) return explicit;

  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (publicUrl) return new URL(publicUrl).hostname.split(".")[0];

  try {
    const mcp = JSON.parse(await readFile(join(ROOT, ".mcp.json"), "utf8"));
    const configured = mcp?.mcpServers?.supabase?.url;
    if (configured) return new URL(configured).searchParams.get("project_ref");
  } catch {
    // The project can still be supplied explicitly when this repo has no MCP file.
  }
  return null;
}

async function responseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function pushTemplates(generated) {
  await checkTemplates(generated);
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = await projectRef();
  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required. Create one at https://supabase.com/dashboard/account/tokens and keep it out of the repo.");
  }
  if (!ref) {
    throw new Error("SUPABASE_PROJECT_REF or --project-ref is required.");
  }

  const patch = {};
  for (const template of generated) {
    patch[`mailer_subjects_${template.key}`] = template.subject;
    patch[`mailer_templates_${template.key}_content`] = template.html;
  }

  const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const updated = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify(patch) });
  if (!updated.ok) {
    const detail = await responseJson(updated);
    throw new Error(`Supabase rejected the template update (${updated.status}): ${detail.message ?? detail.error ?? "unknown error"}`);
  }

  const verified = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!verified.ok) throw new Error(`Templates were updated but verification failed (${verified.status}).`);
  const config = await verified.json();
  const mismatches = Object.entries(patch).filter(([key, value]) => config[key] !== value);
  if (mismatches.length) {
    throw new Error(`Supabase did not retain these fields: ${mismatches.map(([key]) => key).join(", ")}`);
  }
  console.log(`Published and verified ${generated.length} auth email templates for Supabase project ${ref}.`);
}

async function main() {
  const modes = ["--write", "--check", "--push"].filter((mode) => process.argv.includes(mode));
  if (modes.length !== 1) {
    throw new Error("Choose exactly one mode: --write, --check, or --push.");
  }
  const generated = await generatedTemplates();
  if (modes[0] === "--write") await writeTemplates(generated);
  if (modes[0] === "--check") await checkTemplates(generated);
  if (modes[0] === "--push") await pushTemplates(generated);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
