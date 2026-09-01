const STEPS = [
  {
    number: "01",
    title: "Create your account",
    description: "Set up your Arafims account and get access to the platform.",
  },
  {
    number: "02",
    title: "Find your space",
    description:
      "Explore the available spaces and choose the option that suits you.",
  },
  {
    number: "03",
    title: "Send your application",
    description:
      "Submit your details and follow the progress of your application from your account.",
  },
  {
    number: "04",
    title: "Settle in",
    description:
      "Once everything is confirmed, the rest of your Arafims experience stays right here.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold font-display mb-4">
            It starts here.
          </h2>
          <p className="text-lg text-[#b8b8b8]">
            A straightforward way to get your Arafims experience up and
            running.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step, idx) => (
            <div key={idx} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8">
              <div className="text-4xl font-bold text-[#10a574] font-display mb-4">
                {step.number}
              </div>
              <h3 className="text-xl font-bold mb-3 font-display">
                {step.title}
              </h3>
              <p className="text-[#b8b8b8] leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
