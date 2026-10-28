"use client";
import {
  isStripe,
  paymentInfoMap,
  isStripeSandbox,
  isPayPalSandbox,
} from "@/features/storefront/lib/constants";
import { initiatePaymentSession } from "@/features/storefront/lib/data/payment";
import { CircleCheck, CreditCard, FlaskConical, Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ErrorMessage from "../error-message";
import { StripeContext } from "../payment-wrapper/stripe-wrapper";
import { CardElement } from "@stripe/react-stripe-js";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { RiLoader2Fill } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { setCheckoutTip } from "@/features/storefront/lib/data/cart";
import { checkoutDisplayPricing, checkoutSessionMatchesPricing, selectedCheckoutQuote } from "@/features/storefront/lib/checkout-quote-display";
import { formatCurrency } from "@/features/storefront/lib/currency";
import { useCheckoutPaymentState } from "../checkout-state";

interface PaymentProps {
  cart: {
    id: string;
    total: number;
    subtotal?: number;
    tipPercent?: string | number;
    paymentCollection?: {
      paymentSessions?: Array<{
        id: string;
        isSelected: boolean;
        amount: number;
        status?: string;
        data?: any;
        paymentProvider: {
          code: string;
        };
      }>;
    };
    orderType: string;
  };
  storeSettings: any;
  availablePaymentMethods: Array<{
    id: string;
    code: string;
  }>;
}

const TIP_OPTIONS = ["0", "15", "18", "20", "25"] as const;

const Payment = ({ cart, availablePaymentMethods, storeSettings }: PaymentProps) => {
  const activeSession = cart.paymentCollection?.paymentSessions?.find(
    (session) => session.isSelected
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    activeSession?.paymentProvider?.code ?? ""
  );
  const { cardBrand, setCardBrand, cardComplete, setCardComplete } =
    useCheckoutPaymentState();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isTipPending, startTipTransition] = useTransition();

  const currentStep = searchParams?.get("step") || "contact";
  const isOpen = currentStep === "payment" || currentStep === "review";

  const isStripePayment = isStripe(selectedPaymentMethod);
  const stripeReady = useContext(StripeContext);

  const isSandboxMode = isStripeSandbox() || isPayPalSandbox();
  const checkoutQuote = selectedCheckoutQuote(cart);
  const currencyConfig = {
    currencyCode: checkoutQuote?.currencyCode || storeSettings?.currencyCode || "USD",
    locale: storeSettings?.locale || "en-US",
  };
  const deliveryPricing = useMemo(
    () => checkoutDisplayPricing(cart, storeSettings),
    [cart, storeSettings]
  );
  const deliveryMinimumNotMet =
    cart?.orderType === "delivery" && deliveryPricing.deliveryMinimumNotMet;

  const activeSessionMatchesTotal = checkoutSessionMatchesPricing(activeSession, deliveryPricing);
  const selectedSessionMatchesTotal =
    activeSessionMatchesTotal && activeSession?.paymentProvider?.code === selectedPaymentMethod;
  const paymentReady = selectedSessionMatchesTotal;

  const useOptions = useMemo(() => {
    return {
      style: {
        base: {
          // The storefront's ink and type (Archivo, loaded into the Stripe frame by StripeWrapper).
          fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif",
          fontSize: "16px",
          color: "#11171c",
          iconColor: "#11171c",
          "::placeholder": {
            color: "#495158",
          },
        },
        invalid: {
          color: "#c51e21",
          iconColor: "#c51e21",
        },
      },
      classes: {
        base: "block h-11 w-full border border-input bg-paper px-4 py-3 text-base",
      },
      hidePostalCode: true,
    };
  }, []);

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set(name, value);
      return params.toString();
    },
    [searchParams]
  );

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), {
      scroll: false,
    });
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      if (deliveryMinimumNotMet) {
        throw new Error(
          `Delivery requires a minimum subtotal of ${formatCurrency(storeSettings?.deliveryMinimum || 0, currencyConfig, {
            inputIsCents: false,
          })}. Add ${formatCurrency(deliveryPricing.deliveryMinimumShortfall, currencyConfig)} more or switch to pickup.`
        );
      }

      if (!selectedSessionMatchesTotal) {
        await initiatePaymentSession(cart.id, selectedPaymentMethod);
        router.replace(pathname + "?" + createQueryString("step", "payment"), {
          scroll: false,
        });
        router.refresh();
        return;
      }

      if (isStripe(selectedPaymentMethod) && !cardComplete) {
        throw new Error("Enter your card details to continue.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const subtotal = Number(checkoutQuote?.pricing?.subtotal ?? cart?.subtotal ?? 0);
  const tipPercent = String(checkoutQuote?.cart?.tipPercent ?? cart?.tipPercent ?? "0");

  const handleTipChange = (nextTipPercent: string) => {
    if (nextTipPercent === tipPercent || isTipPending) {
      return;
    }

    startTipTransition(async () => {
      const result = await setCheckoutTip(nextTipPercent);
      if (result.success) {
        router.refresh();
      }
    });
  };

  useEffect(() => {
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isStripe(selectedPaymentMethod)) {
      setCardComplete(false);
      setCardBrand(null);
    }
  }, [selectedPaymentMethod, setCardBrand, setCardComplete]);

  return (
    <div>
      <div className="mb-5 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <Wallet className="h-4 w-4 text-foreground" />
          </div>
          <h2
            className={cn("font-serif text-xl font-bold tracking-tight", {
              "text-muted-foreground": !isOpen && !paymentReady,
            })}
          >
            Payment
          </h2>
          {!isOpen && paymentReady ? <CircleCheck className="h-4 w-4 text-green-600" /> : null}
        </div>
        {!isOpen && paymentReady ? (
          <Button
            onClick={handleEdit}
            data-testid="edit-payment-button"
            variant="ghost"
            size="sm"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Edit
          </Button>
        ) : null}
      </div>

      <div>
        <div className={isOpen ? "block" : "hidden"}>
          <div className=" bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-medium text-foreground">Tip the team</p>
                <p className="mt-1 text-sm text-muted-foreground">Optional for both pickup and delivery.</p>
              </div>
              {isTipPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {TIP_OPTIONS.map((option) => {
                const optionTip = Math.round(subtotal * (Number(option) / 100));
                const selected = tipPercent === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleTipChange(option)}
                    disabled={isTipPending}
                    className={cn(
                      "border px-3 py-3 text-left transition-colors",
                      selected
                        ? "border-primary/50 bg-muted"
                        : "border-border bg-muted/35 hover:border-primary/25"
                    )}
                  >
                    <span className="block text-sm font-medium text-foreground">{option}%</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {option === "0" ? "No tip" : formatCurrency(optionTip, currencyConfig)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {availablePaymentMethods?.length > 0 ? (
            <div className="mt-6 space-y-3">
              <RadioGroup value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod} className="space-y-3">
                {availablePaymentMethods.map((method) => (
                  <div key={method.id} className="relative">
                    <RadioGroupItem value={method.code} id={method.id} className="sr-only" />
                    <Label
                      htmlFor={method.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between border px-5 py-4 transition-colors",
                        selectedPaymentMethod === method.code
                          ? "border-primary/50 bg-muted"
                          : "border-border bg-muted/35 hover:border-primary/25"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn("flex size-4 items-center justify-center rounded-full border", {
                          "border-primary": selectedPaymentMethod === method.code,
                          "border-border": selectedPaymentMethod !== method.code,
                        })}>
                          {selectedPaymentMethod === method.code ? <div className="size-2 rounded-full bg-primary" /> : null}
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {paymentInfoMap[method.code]?.title || method.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {isSandboxMode ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex size-5 items-center justify-center rounded-full bg-muted text-foreground">
                                  <FlaskConical className="size-3" strokeWidth={2.5} />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Sandbox environment – do not enter real payment info</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                        <div className="flex size-5 items-center justify-center text-foreground">
                          {paymentInfoMap[method.code]?.icon}
                        </div>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              {isStripePayment && stripeReady ? (
                <div className=" bg-background p-4">
                  <p className="text-sm font-medium text-primary">Card details</p>
                  <div className="mt-3">
                    <CardElement
                      options={useOptions}
                      onChange={(e) => {
                        if (e.brand) {
                          setCardBrand(e.brand.charAt(0).toUpperCase() + e.brand.slice(1));
                        }
                        setError(e.error?.message || null);
                        setCardComplete(e.complete);
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <ErrorMessage error={error} data-testid="payment-method-error-message" />

          {deliveryMinimumNotMet ? (
            <div className="mt-4 border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-800">
                Delivery requires a minimum subtotal of {formatCurrency(storeSettings?.deliveryMinimum || 0, currencyConfig, { inputIsCents: false })}.
              </p>
              <p className="mt-1 text-sm text-amber-700">
                Add {formatCurrency(deliveryPricing.deliveryMinimumShortfall, currencyConfig)} more or switch this order to pickup.
              </p>
            </div>
          ) : null}

          {!selectedSessionMatchesTotal ? (
            <Button
              onClick={handleSubmit}
              size="lg"
              disabled={!selectedPaymentMethod || isLoading || deliveryMinimumNotMet}
              data-testid="submit-payment-button"
              variant="ghost"
              className="mt-5 h-12 w-full rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            >
              {isLoading ? <RiLoader2Fill className="mr-2 h-4 w-4 animate-spin" /> : null}
              Set up payment
            </Button>
          ) : null}
        </div>

        <div className={isOpen ? "hidden" : "block"}>
          {cart && paymentReady && activeSession ? (
            <div className="space-y-4 pl-11">
              <div>
                <p className="mb-1 text-[0.95rem] font-semibold text-ink-soft">
                  Payment Method
                </p>
                <p className="text-sm text-foreground" data-testid="payment-method-summary">
                  {paymentInfoMap[selectedPaymentMethod]?.title || selectedPaymentMethod}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[0.95rem] font-semibold text-ink-soft">
                  Details
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="payment-details-summary">
                  <div className="flex size-8 items-center justify-center bg-background">
                    {paymentInfoMap[selectedPaymentMethod]?.icon || <CreditCard className="size-4" />}
                  </div>
                  <span>
                    {isStripe(selectedPaymentMethod) && cardBrand ? cardBrand : "Ready in order summary"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Payment;
