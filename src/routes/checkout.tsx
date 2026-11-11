import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { YbrdLogo } from "@/components/YbrdLogo";
import { useAccount } from "@/components/AccountProvider";
import { useStorefrontCart } from "@/components/StorefrontCart";
import { AddressFields, commerceInputClass } from "@/components/ShippingFields";
import { brl, commerceRequest } from "@/lib/commerce";
import {
  cartPayload,
  checkoutSchema,
  contactSchema,
  couponStorageKey,
  type CheckoutReview,
  type CheckoutInput,
  type PlacedOrder,
} from "@/lib/checkout";
import {
  addressSchema,
  digits,
  emptyAddress,
  type AddressDraft,
  type ShippingQuote,
  type ShippingReply,
} from "@/lib/shipping";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [{ title: "Checkout — Ybrd" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CheckoutPage,
});
const steps = ["Identificação", "Entrega", "Pagamento", "Revisão"];
const cpfMask = (value: string) =>
  value
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
    .replace(/(\.\d{3})(\d{2})$/, "$1-$2");

function CheckoutPage() {
  const { user } = useAccount();
  const { cart, commerce, subtotalCentavos, refresh, clear } = useStorefrontCart();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [address, setAddress] = useState<AddressDraft>(emptyAddress);
  const [saved, setSaved] = useState<{ id: string; endereco: AddressDraft }[]>([]);
  const [saveAddress, setSaveAddress] = useState(false);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [shippingId, setShippingId] = useState("");
  const [method, setMethod] = useState<CheckoutInput["metodo"]>("pix");
  const [parts, setParts] = useState(1);
  const [coupon, setCoupon] = useState("");
  const [review, setReview] = useState<CheckoutReview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const attempt = useRef<string | undefined>(undefined);
  const sending = useRef(false);
  const isAccount = Boolean(user?.email);
  const items = cartPayload(cart);

  useEffect(() => {
    void refresh();
    try {
      setCoupon(sessionStorage.getItem(couponStorageKey)?.slice(0, 32) ?? "");
      if (sessionStorage.getItem("ybrd-checkout-method") === "cartao") setMethod("cartao");
    } catch {
      /* The form can be completed without browser storage. */
    }
  }, [refresh]);
  useEffect(() => {
    if (user?.email) setEmail((value) => value || user.email!);
  }, [user?.email]);
  useEffect(() => {
    if (!isAccount || !commerce.enabled) return;
    const controller = new AbortController();
    void commerceRequest<{ enderecos: typeof saved }>("enderecos", {}, controller.signal)
      .then((data) => setSaved(data.enderecos))
      .catch(() => {});
    return () => controller.abort();
  }, [isAccount, commerce.enabled]);
  useEffect(() => {
    if (!busy || step !== 3) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy, step]);

  const run = async (action: () => Promise<void>) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const shipping = async () => {
    if (!addressSchema.safeParse(address).success)
      throw new Error("Confira o endereço e o telefone.");
    const data = await commerceRequest<ShippingReply>("frete", { items, cep: address.cep });
    setQuotes(data.options);
    setShippingId(
      data.options.find((option) => option.id === shippingId)?.id ?? data.options[0]?.id ?? "",
    );
    if (!data.options.length) setMessage("Não há entrega disponível para este endereço.");
  };
  const buildInput = (installments = parts) => {
    const parsed = checkoutSchema.safeParse({
      account: isAccount,
      items,
      contato: { email, cpf },
      endereco: address,
      freteId: shippingId,
      cupom: coupon,
      metodo: method,
      parcelas: installments,
      salvarEndereco: saveAddress,
    });
    if (!parsed.success) throw new Error("Confira a identificação, o endereço e a entrega.");
    return parsed.data;
  };
  const requestReview = async (installments = parts) => {
    const data = await commerceRequest<CheckoutReview>("revisao", buildInput(installments));
    setReview(data);
    setParts(installments);
    setAccepted(false);
    return data;
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      if (step === 0) {
        if (!contactSchema.safeParse({ email, cpf }).success)
          throw new Error("Confira seu e-mail e CPF.");
        setStep(1);
      } else if (step === 1) {
        if (!quotes.length) {
          await shipping();
          return;
        }
        if (!shippingId) throw new Error("Escolha uma opção de entrega.");
        setStep(2);
      } else if (step === 2) {
        await requestReview();
        setStep(3);
      } else {
        if (!accepted || !review) throw new Error("Leia e aceite os termos antes de pagar.");
        attempt.current ??= crypto.randomUUID();
        const order = await commerceRequest<PlacedOrder>("criar-pedido", {
          ...buildInput(),
          reviewToken: review.reviewToken,
          idempotencia: attempt.current,
          aceitouTermos: true,
        });
        setPlaced(order);
        clear();
      }
    });
  };
  const changeAddress = (value: AddressDraft) => {
    setAddress(value);
    setQuotes([]);
    setShippingId("");
    setReview(null);
  };
  const summary = (
    <div className="space-y-3 text-sm">
      <ul className="space-y-2">
        {cart.map((item) => (
          <li key={`${item.slug}:${item.size}`} className="flex justify-between gap-4">
            <span>
              {item.quantity}× {item.product.name}
              {item.size ? ` / ${item.size}` : ""}
            </span>
            <span className="whitespace-nowrap font-mono">
              {brl(item.product.priceCentavos * item.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-border pt-3">
        <p className="flex justify-between gap-3">
          <span>Subtotal</span>
          <span>{brl(review?.subtotal_centavos ?? subtotalCentavos)}</span>
        </p>
        {review && (
          <>
            <p className="flex justify-between gap-3">
              <span>Entrega</span>
              <span>{brl(review.frete_centavos)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span>Descontos</span>
              <span>{brl(review.desconto_centavos)}</span>
            </p>
            <p className="micro flex justify-between gap-3">
              <span>Total</span>
              <span>{brl(review.total_centavos)}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
  return (
    <main className="site-width py-8 md:py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="wordmark" aria-label="YBRD início">
          <YbrdLogo />
        </Link>
        <Link to="/sacola" className="micro underline">
          Voltar à sacola
        </Link>
      </div>
      <h1 className="section-title mb-5">Finalizar compra</h1>
      {placed ? (
        <p role="status">Pedido {placed.numero} recebido. Aguarde as instruções de pagamento.</p>
      ) : !commerce.enabled ? (
        <p>Compras ainda indisponíveis.</p>
      ) : !cart.length ? (
        <p>Sua sacola está vazia.</p>
      ) : (
        <>
          <ol
            className="micro mb-6 grid grid-cols-2 gap-2 md:grid-cols-4"
            aria-label="Etapas da compra"
          >
            {steps.map((name, i) => (
              <li
                key={name}
                aria-current={step === i ? "step" : undefined}
                className={`border-b p-2 ${step === i ? "border-foreground" : "border-border text-muted-foreground"}`}
              >
                {i + 1} / {name}
              </li>
            ))}
          </ol>
          <details className="mb-4 border border-border p-4 md:hidden">
            <summary className="micro cursor-pointer">Resumo do pedido</summary>
            <div className="mt-4">{summary}</div>
          </details>
          <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
            <form
              onSubmit={submit}
              className="space-y-5 border border-border p-4 md:p-6"
              aria-busy={busy}
            >
              <h2 className="section-title">{steps[step]}</h2>
              {message && (
                <p role="alert" className="border border-border p-3 text-sm">
                  {message}
                </p>
              )}
              {step === 0 && (
                <>
                  {!isAccount && (
                    <p className="text-sm">
                      <Link
                        to="/entrar"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Entrar
                      </Link>{" "}
                      ·{" "}
                      <Link
                        to="/criar-conta"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Criar conta
                      </Link>{" "}
                      · Comprar como convidado
                    </p>
                  )}
                  <label className="grid gap-1 text-sm">
                    E-mail
                    <input
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={commerceInputClass}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    CPF
                    <input
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      value={cpfMask(cpf)}
                      onChange={(e) => setCpf(digits(e.target.value).slice(0, 11))}
                      className={commerceInputClass}
                    />
                  </label>
                </>
              )}
              {step === 1 && (
                <>
                  {saved.length > 0 && (
                    <label className="grid gap-1 text-sm">
                      Endereço salvo
                      <select
                        className={commerceInputClass}
                        defaultValue=""
                        onChange={(e) => {
                          const found = saved.find((a) => a.id === e.target.value);
                          changeAddress(found?.endereco ?? emptyAddress);
                        }}
                      >
                        <option value="">Novo endereço</option>
                        {saved.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.endereco.rua}, {a.endereco.numero} · {a.endereco.cidade}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <AddressFields address={address} onChange={changeAddress} />
                  {isAccount && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)}
                      />
                      Salvar endereço na conta
                    </label>
                  )}
                  {quotes.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="micro mb-2">Opções de entrega</legend>
                      {quotes.map((option) => (
                        <label
                          key={option.id}
                          className="flex items-center gap-3 border border-border p-3 text-sm"
                        >
                          <input
                            type="radio"
                            name="frete"
                            checked={shippingId === option.id}
                            onChange={() => setShippingId(option.id)}
                          />
                          {option.nome} · até {option.prazoDias} dias úteis ·{" "}
                          {brl(option.precoCentavos)}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <fieldset className="space-y-2">
                    <legend className="micro mb-2">Forma de pagamento</legend>
                    {(
                      [
                        [
                          "pix",
                          `Pix${commerce.pixPercent ? ` · ${commerce.pixPercent}% de desconto` : ""}`,
                        ],
                        ["cartao", "Cartão de crédito"],
                      ] as const
                    ).map(([value, name]) => (
                      <label
                        key={value}
                        className="flex items-center gap-3 border border-border p-3 text-sm"
                      >
                        <input
                          type="radio"
                          name="pagamento"
                          checked={method === value}
                          onChange={() => {
                            setMethod(value);
                            setParts(1);
                            try {
                              sessionStorage.setItem("ybrd-checkout-method", value);
                            } catch {
                              /* Optional preference. */
                            }
                          }}
                        />
                        {name}
                      </label>
                    ))}
                  </fieldset>
                  <label className="grid gap-1 text-sm">
                    Cupom
                    <input
                      autoComplete="off"
                      maxLength={32}
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                      className={commerceInputClass}
                    />
                  </label>
                </>
              )}
              {step === 3 && review && (
                <>
                  <div className="space-y-1 text-sm">
                    <p className="micro">Entrega / {review.frete.nome}</p>
                    <p>{address.destinatario}</p>
                    <p>
                      {address.rua}, {address.numero} · {address.bairro}
                    </p>
                    <p>
                      {address.cidade} / {address.uf} · {address.cep}
                    </p>
                    <p>Até {review.frete.prazoDias} dias úteis</p>
                  </div>
                  {method === "cartao" && (
                    <label className="grid gap-1 text-sm">
                      Parcelas
                      <select
                        className={commerceInputClass}
                        value={parts}
                        disabled={busy}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          void run(async () => {
                            await requestReview(value);
                          });
                        }}
                      >
                        {Array.from({ length: review.parcelas_maximas }, (_, i) => i + 1).map(
                          (n) => (
                            <option key={n} value={n}>
                              {n}x de {brl(Math.ceil(review.total_centavos / n))}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      required
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />
                    <span>
                      Li e aceito os{" "}
                      <Link
                        to="/politicas"
                        hash="termos"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Termos de uso
                      </Link>{" "}
                      e a{" "}
                      <Link
                        to="/politicas"
                        hash="troca"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Política de troca
                      </Link>
                      .
                    </span>
                  </label>
                </>
              )}
              <div className="flex flex-wrap gap-3">
                {step > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={busy}
                    onClick={() => {
                      setStep(step - 1);
                      setReview(null);
                      setAccepted(false);
                      setMessage("");
                    }}
                  >
                    Voltar
                  </Button>
                )}
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={busy || (step === 3 && !accepted)}
                >
                  {busy
                    ? "Aguarde"
                    : step === 3
                      ? "Pagar"
                      : step === 1 && !quotes.length
                        ? "Calcular entrega"
                        : step === 2
                          ? "Revisar pedido"
                          : "Continuar"}
                </Button>
              </div>
            </form>
            <aside className="hidden space-y-4 border border-border p-5 md:sticky md:top-5 md:block">
              <h2 className="micro">Resumo do pedido</h2>
              {summary}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
