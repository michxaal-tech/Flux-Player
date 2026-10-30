// File picking, shared by every "Add music" control.
//
// iOS greys out .mp3 files under a bare accept="audio/*" — its Files picker
// matches on UTI, and audio/* does not cover everything (files from Drive and
// Dropbox especially). Listing concrete types AND extensions is what makes them
// selectable; `any` drops the filter entirely as a last resort. Files are still
// validated after selection either way.
import { addFiles } from "../audio/transport";

const ACCEPT = "audio/*,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/wave,audio/flac,audio/x-flac,audio/ogg,audio/opus,application/ogg,.mp3,.m4a,.m4b,.aac,.wav,.wave,.flac,.ogg,.oga,.opus,.aif,.aiff,.caf,.wma,.mp4,.alac";

export function pickFiles(any = false): void {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  if (!any) input.accept = ACCEPT;
  input.style.display = "none";
  input.onchange = () => {
    if (input.files?.length) void addFiles(input.files);
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}
