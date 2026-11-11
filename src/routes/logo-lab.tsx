import { createFileRoute, Link } from "@tanstack/react-router";
import { YbrdLogoDrawing } from "@/components/YbrdLogo";

export const Route = createFileRoute("/logo-lab")({
  head: () => ({
    meta: [{ title: "YBRD / Logo lab" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: LogoLab,
});

function LogoLab() {
  return (
    <main className="logo-lab">
      <header>
        <p className="micro">YBRD / ESTUDO DO R</p>
        <h1>Logo lab</h1>
        <p>
          Contornos originais de Y, B e D preservados. Apenas o R e seus espaços foram refinados.
        </p>
        <p>O projeto usa duas versões tipográficas. O anel com COMPANY não está no repositório.</p>
        <Link to="/" search={{}}>
          Voltar ao site
        </Link>
      </header>
      {(["figtree", "unbounded"] as const).map((face) => (
        <section key={face}>
          <h2>{face === "figtree" ? "Cabeçalho / Figtree 700" : "Hero / Unbounded 500"}</h2>
          {(["positive", "negative"] as const).map((tone) => (
            <section
              key={tone}
              className={`logo-lab-tone logo-lab-${tone}`}
              aria-label={tone === "positive" ? "Preto sobre cream" : "Cream sobre ink"}
            >
              <p className="micro">{tone === "positive" ? "PRETO / CREAM" : "CREAM / INK"}</p>
              <div
                className="logo-lab-scroll"
                tabIndex={0}
                role="region"
                aria-label="Comparação das quatro versões, com rolagem horizontal"
              >
                <table>
                  <thead>
                    <tr>
                      {(["original", "A", "B", "C"] as const).map((design) => (
                        <th key={design} scope="col">
                          {design === "original" ? "Atual" : `Variante ${design}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[16, 24, 48, 120].map((height) => (
                      <tr key={height}>
                        {(["original", "A", "B", "C"] as const).map((design) => (
                          <td key={design}>
                            <span className="micro logo-lab-size">{height}px de altura</span>
                            <YbrdLogoDrawing
                              face={face}
                              design={design}
                              title={`YBRD — ${design === "original" ? "atual" : design}, ${height}px`}
                              className={`logo-lab-mark logo-lab-h${height}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </section>
      ))}
      <section className="logo-lab-recommendation">
        <h2>Recomendação / A</h2>
        <p>A mantém o contador fechado e a leitura mais estável em 16 e 24px.</p>
        <p>A barriga superior repete o contorno e o contador do B, sem redimensionamento.</p>
        <p>A haste repete o perfil do B, inclusive a cintura inclinada na versão do hero.</p>
        <p>A perna única equilibra o peso e mantém os cortes retos coerentes com o D.</p>
        <p>O espaçamento manual aproxima B–R e R–D; B e C ficam como alternativas de comparação.</p>
      </section>
    </main>
  );
}
