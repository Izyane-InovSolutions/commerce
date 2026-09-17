import type {
  FulfillmentDispatch,
  FulfillmentDispatchLine,
  FulfillmentEvent,
  FulfillmentException,
  FulfillmentLine,
  FulfillmentOrder,
  FulfillmentWorkItem,
} from '@prisma/client';

export type FulfillmentOrderWithDetail = FulfillmentOrder & {
  lines: FulfillmentLine[];
  workItems: FulfillmentWorkItem[];
  exceptions: FulfillmentException[];
};

export type FulfillmentDispatchWithLines = FulfillmentDispatch & {
  lines: FulfillmentDispatchLine[];
};

export type FulfillmentOrderPage = {
  items: FulfillmentOrderWithDetail[];
  total: number;
  page: number;
  limit: number;
};

export type { FulfillmentEvent };
