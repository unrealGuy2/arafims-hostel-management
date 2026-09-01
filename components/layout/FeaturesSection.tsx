const FEATURES = [
  {
    title: "Find your space",
    description:
      "See available spaces, choose what works for you, and send your application without the usual back-and-forth.",
  },
  {
    title: "Know where things stand",
    description:
      "From an application to its final confirmation, the important updates stay connected to your account.",
  },
  {
    title: "Speak up when something is wrong",
    description:
      "Send a complaint or report an issue through Arafims and keep track of what happens next.",
  },
  {
    title: "Keep your records close",
    description:
      "Important payment information, caution fee records and other details stay tied to your Arafims account.",
  },
  {
    title: "Stay in the loop",
    description:
      "Get the information that matters to you without having to chase it through different channels.",
  },
  {
    title: "Arafims, wherever you are",
    description:
      "The same platform connects the different parts of the Arafims experience in one place.",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0f0f0f]">
      <div className="max-w-6xl mx-auto">
        <p className="text-lg text-[#b8b8b8] text-center mb-16 max-w-2xl mx-auto leading-relaxed">
          Arafims brings the important parts of your hostel experience together
          without making things complicated.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((feature, idx) => (
            <div key={idx} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8">
              <h3 className="text-xl font-bold mb-3 font-display">
                {feature.title}
              </h3>
              <p className="text-[#b8b8b8] leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
