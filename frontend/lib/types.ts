// Public shapes shared by server and browser code. The user is an allowlist: id, name, email.
export type PublicUser = {
  id: string;
  name: string;
  email: string;
};

export type SuccessEnvelope<T> = { data: T };

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    request_id?: string;
    fields?: Record<string, string>;
  };
};
