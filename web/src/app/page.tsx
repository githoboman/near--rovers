import React from "react";
import { Hero } from "@/components/landing/Hero";
import { ProtocolOverview } from "@/components/landing/ProtocolOverview";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeaturedClaims } from "@/components/landing/FeaturedClaims";
import { Architecture } from "@/components/landing/Architecture";
import { FinalCta } from "@/components/landing/FinalCta";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ProtocolOverview />
      <HowItWorks />
      <FeaturedClaims />
      <Architecture />
      <FinalCta />
    </>
  );
}
