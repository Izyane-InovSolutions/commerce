import { OrderWithItems } from '../orders/orders.service';
import { PaymentWithRedirect } from '../payments/payments.service';

export type CheckoutResult = {
  order: OrderWithItems;
  payment: PaymentWithRedirect;
};

export type { CheckoutQuote } from '../orders/orders.service';
