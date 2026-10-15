import Image from "next/image";

const companies = [
  { name: "Adobe", logo: "/company/adobe.svg" },
  { name: "AWS", logo: "/company/amazonaws.svg" },
  { name: "Canva", logo: "/company/canva.svg" },
  { name: "Datadog", logo: "/company/datadog.svg" },
  { name: "Docker", logo: "/company/docker.svg" },
  { name: "Hitachi", logo: "/company/hitachi.svg" },
  { name: "IBM", logo: "/company/ibm.svg" },
  { name: "JetBrains", logo: "/company/jetbrains.svg" },
  { name: "Meituan", logo: "/company/meituan.svg" },
  { name: "Microsoft", logo: "/company/microsoft.svg" },
  { name: "Odoo", logo: "/company/odoo.svg" },
  { name: "Oracle", logo: "/company/oracle.svg" },
  { name: "Samsung", logo: "/company/samsung.svg" },
  { name: "Siemens", logo: "/company/siemens.svg" },
  { name: "Tailscale", logo: "/company/tailscale.svg" },
] as const;

export default function CompanyLogos() {
  return (
    <section
      aria-labelledby="company-logos-heading"
      className="overflow-hidden border-t border-surface-container bg-surface-container-low py-20 lg:py-24"
    >
      <div className="mx-auto w-screen max-w-[1200px] px-4 sm:px-6 lg:px-10">
        <h2
          id="company-logos-heading"
          className="text-center text-2xl font-semibold leading-snug tracking-[-0.02em] text-on-surface"
        >
          Starred by engineers at
        </h2>
        <ul className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-5 lg:gap-x-10 lg:gap-y-10">
          {companies.map((company) => (
            <li key={company.name} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
              <Image
                src={company.logo}
                alt=""
                width={40}
                height={40}
                className="company-logo h-10 w-10 object-contain"
                loading="lazy"
              />
              <span className="text-[0.9375rem] font-medium leading-5 text-on-surface-variant">
                {company.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
