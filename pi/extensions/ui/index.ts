import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import promptEditor from "./prompt-editor.ts";
import statusFooter from "./status-footer.ts";
import turnProgress from "./turn-progress.ts";

export default function (pi: ExtensionAPI) {
  promptEditor(pi);
  statusFooter(pi);
  turnProgress(pi);
}
