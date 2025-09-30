import React from "react";

import type { Page } from "@webcules/payload/payload-types";

import { HighImpactHero } from "@webcules/payload/heros/HighImpact";
import { LowImpactHero } from "@webcules/payload/heros/LowImpact";
import { MediumImpactHero } from "@webcules/payload/heros/MediumImpact";

const heroes = {
  highImpact: HighImpactHero,
  lowImpact: LowImpactHero,
  mediumImpact: MediumImpactHero,
};

export const RenderHero: React.FC<Page["hero"]> = (props) => {
  const { type } = props || {};

  if (!type || type === "none") return null;

  const HeroToRender = heroes[type];

  if (!HeroToRender) return null;

  return <HeroToRender {...props} />;
};
