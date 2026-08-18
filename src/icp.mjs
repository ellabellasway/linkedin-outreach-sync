// The ICP rubric Claude scores each lead against. This is the single place
// that defines "who is a good-fit buyer" — edit it freely, the classifier is
// only as good as the criteria below.
//
// EXAMPLE RUBRIC — this one is written for a fictional developer-tools SaaS,
// as an illustration of the level of detail that makes a rubric actually
// work. Replace the whole string with your own product and ICP before
// running this for real.

export const RUBRIC = `You are qualifying leads for a developer-tools SaaS
product (example ICP — replace with your own product and buyer profile).

Classify each person by how well their ROLE and COMPANY fit the product's
ideal customer. You are given the person's job title plus their company's
industry, employee count, annual revenue (often missing), and a short
description of what the company does.

ROLE fit (from job title):
- yes: software/backend/full-stack engineer, data engineer, DevOps/platform
  engineer, technical founder, CTO, VP/Director of Engineering, or a
  technical role that would actually adopt a developer tool.
- unclear: technical-adjacent (product manager, DevRel, a technical-sounding
  title with no clear seniority), missing title, or a generic title that
  could be technical or not.
- no: clearly non-technical (sales, HR, recruiting, marketing-only, finance,
  real estate), student, job seeker, or retired.

COMPANY fit (weight the description and industry most; use size as a
secondary signal):
- yes: the description/industry indicate software, SaaS, data/analytics,
  AI/ML, or dev-tools, i.e. any business that plausibly builds and ships
  software. Companies of any size qualify, early-stage startups are good
  fits, not just large ones.
- unclear: company data missing, or industry/description too generic to
  tell (e.g. just "Information Technology and Services" with no
  description).
- no: description/industry clearly outside the buyer base — local services,
  brick-and-mortar retail, real-estate brokerage, hospitality, agencies
  whose only offering is non-technical, construction, healthcare delivery,
  education institutions.

Size/revenue are secondary: do NOT down-rank a strong technical fit just
because the company is small or has no revenue listed. Use size mainly to
break ties or to flag a solo/freelancer "company" that mirrors the person's
own name (usually weak).

Overall fit:
- strong: role yes AND company yes.
- possible: role yes but company unclear; OR role unclear but company yes.
- weak: role no, OR company no, OR both unclear.

Be decisive but honest about uncertainty. Base the verdict only on the data
provided, do not invent facts. Keep reasoning to one short sentence.`;

// Which tiers get pushed to the outreach campaign. Tighten to ["strong"] to
// be conservative.
export const QUALIFYING_TIERS = ["strong", "possible"];

// JSON schema the model is forced to emit (structured outputs).
// Note: structured outputs disallow minLength/maxLength, keep constraints to enums.
export const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    fit: { type: "string", enum: ["strong", "possible", "weak"] },
    roleFit: { type: "string", enum: ["yes", "unclear", "no"] },
    companyFit: { type: "string", enum: ["yes", "unclear", "no"] },
    reasoning: { type: "string" },
  },
  required: ["fit", "roleFit", "companyFit", "reasoning"],
  additionalProperties: false,
};
