import { MAX_FILE_CHARS, MAX_MESSAGE_CHARS } from "../engine";
import type { SendError, SessionEditError } from "../session/session";

export const SEND_ERROR_TEXT: Record<SendError, string> = {
  not_playing: "This attempt is over. Restart the level to play again.",
  empty_message: "Type a message first.",
  message_too_long: `Messages are limited to ${MAX_MESSAGE_CHARS} characters.`,
  unknown_warden: "That warden is not on this level.",
  turn_cap_reached: "Out of messages. Restart the level to play again.",
};

export const EDIT_ERROR_TEXT: Record<SessionEditError, string> = {
  not_found: "That file does not exist.",
  not_editable: "That file is read-only.",
  too_long: `Files are limited to ${MAX_FILE_CHARS} characters.`,
  not_playing: "This attempt is over. Restart the level to edit files again.",
};

export const UNEXPECTED_ERROR_TEXT = "Something went wrong. Restart the level and try again.";
