export type ResponseMeta = {
  requestId: string;
};

export type SuccessEnvelope<T> = {
  data: T;
  meta: ResponseMeta;
};

export type ErrorDetail = {
  field?: string;
  message: string;
};

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details: ErrorDetail[];
  };
  requestId: string;
};
