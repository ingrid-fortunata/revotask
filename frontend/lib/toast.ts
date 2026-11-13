import toast from "react-hot-toast";

// One wrapper around the toast library, so components do not import it directly (FE-A2).
export function notifySuccess(message: string): void {
  toast.success(message);
}

export function notifyError(message: string): void {
  toast.error(message);
}
