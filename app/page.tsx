import { Navigation } from "@/components/layout/Navigation";
import { HeroSection } from "@/components/layout/HeroSection";
import { HostelsSection } from "@/components/layout/HostelsSection";
import { FeaturesSection } from "@/components/layout/FeaturesSection";
import { HowItWorksSection } from "@/components/layout/HowItWorksSection";
import { FinalCTASection } from "@/components/layout/FinalCTASection";

export default function Home() {
  return (
    <div className="bg-[#0f0f0f]">
      <Navigation />
      <HeroSection />
      <HostelsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <FinalCTASection />
    </div>
  );
}
