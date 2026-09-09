import { CTAButton } from "@/components/shared/cta-button";
import { Check, X } from "lucide-react";
import { Righteous } from "next/font/google";
import Image from "next/image";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export default function PriceTable() {
  const data = [
    {
      feature: "Get a beautiful, fast-loading website up and running quickly.",
      isAvailable: {
        particle: true,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature: "Turn your sketches into beautiful, user-friendly designs.",
      isAvailable: {
        particle: true,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature:
        "Effortlessly handle data from source to destination, ensuring accuracy and utility.",
      isAvailable: {
        particle: true,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature:
        "Seamlessly launch your website with zero downtime, ready for liftoff.",
      isAvailable: {
        particle: true,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature:
        "Develop interactive websites/apps with vibrant colors and 3D elements.",
      isAvailable: {
        particle: false,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature: "Transform ideas into detailed design prototypes using Figma.",
      isAvailable: {
        particle: false,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature:
        "Cleanse, transform, and manage your data for better insights and decisions.",
      isAvailable: {
        particle: false,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature:
        "Create complex web applications with cutting-edge design and advanced functionality.",
      isAvailable: {
        particle: false,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature:
        "Deploy your website quickly and efficiently, ensuring high performance.",
      isAvailable: {
        particle: false,
        atom: true,
        molecule: true,
        compound: true,
      },
    },
    {
      feature: "Priority support with 24/7 availability.",
      isAvailable: {
        particle: false,
        atom: false,
        molecule: true,
        compound: true,
      },
    },
    {
      feature: "Unlimited design revisions.",
      isAvailable: {
        particle: false,
        atom: false,
        molecule: true,
        compound: true,
      },
    },
    {
      feature: "Number of sprints/month",
      sprints: { particle: "fixed", atom: 1, molecule: 2, compound: "custom" },
    },
  ];

  const IconCell = () => (
    <div>
      <Check
        className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full p-2 float-end"
        size={32}
      />
    </div>
  );
  const IconCellDisabled = () => (
    <div>
      <X className="bg-gray-700 rounded-full p-2 float-end" size={32} />
    </div>
  );
  return (
    <div id="pricing" className="price w-full flex justify-center min-h-screen">
      <div className="lg:max-w-[85rem] w-full flex flex-col relative">
        <div className="w-full h-1/2 sm:h-[120vh]">
          <Image
            src={"imgs/rocket.svg"}
            alt="rocket release"
            className="rocket-img"
            fill
            style={{
              objectPosition: "top",
              objectFit: "contain",
            }}
          />
        </div>
        <div
          className={`mt-80 sm:mt-0 grid grid-cols-1 sm:grid-cols-4 gap-y-2 gap-x-2 sm:gap-x-4 rounded-tl-3xl rounded-tr-3xl px-4 pt-4 pb-40 mb-4 z-10 bg-darkest 
          bg-[radial-gradient(at_100%_0%,rgb(217,70,239,0.28)0,transparent_40%),radial-gradient(at_0%_0%,rgb(99,102,241,0.28)0,transparent_40%),radial-gradient(at_50%_0%,rgb(56,189,248,0.22)0,transparent_38%)]
        md:bg-[radial-gradient(at_90%_0%,rgb(217,70,239,0.3)0,transparent_24%),radial-gradient(at_10%_0%,rgb(99,102,241,0.3)0,transparent_24%),radial-gradient(at_50%_0%,rgb(56,189,248,0.25)0,transparent_32%)] 
          + ${righteous.className}`}
        >
          <div className="h-fit sm:col-span-4 flex flex-col justify-center items-center overflow-hidden rounded-3xl px-4 py-10 z-10">
            <span className="anim whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border-gray-500 border">
              Pricing
            </span>
            <div
              className={`anim flex flex-col justify-end text-center bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-transparent via-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[40px] sm:w-3/5 leading-tight my-4 + ${righteous.className}`}
            >
              <div>Tailored Solutions, Transparent Pricing</div>
              <p className="text-sm">
                Unlock the plan for your unique digital journey today
              </p>
            </div>
          </div>
          <div className="sm:hidden h-fit rounded-2xl border-[0.5px] border-gray-700 p-4 flex flex-col gap-y-2">
            <p className="text-lg sm:text-2xl text-bold text-gray-400">
              Particle
            </p>
            <div className="text-[5vw] sm:text-5xl text-white">
              Fixed{" "}
              <span className="text-md sm:text-2xl text-bold text-gray-400">
                /one time
              </span>
            </div>
            <CTAButton pricing={true} />
          </div>

          <div className="sm:hidden h-fit rounded-2xl border-[0.5px] border-gray-700 p-4 flex flex-col gap-y-2">
            <p className="text-lg sm:text-2xl text-bold text-gray-400">Atom</p>
            <div className="text-[5vw] sm:text-5xl text-white">
              $1,250{" "}
              <span className="text-md sm:text-2xl text-bold text-gray-400">
                /2-week sprint
              </span>
            </div>
            <CTAButton pricing={true} />
          </div>

          <div className="sm:hidden h-fit rounded-2xl border-[0.5px] border-gray-700 p-4 flex flex-col gap-y-2">
            <p className="text-lg sm:text-2xl text-bold text-gray-400">
              Molecule
            </p>
            <div className="text-[5vw] sm:text-5xl text-white">
              $2,400{" "}
              <span className="text-md sm:text-2xl text-bold text-gray-400">
                /2-week sprint
              </span>
            </div>
            <CTAButton pricing={true} />
          </div>

          <div className="sm:hidden h-fit rounded-2xl border-[0.5px] border-gray-700 p-4 flex flex-col gap-y-2">
            <p className="text-lg sm:text-2xl text-bold text-gray-400">
              Compound
            </p>
            <div className="text-[5vw] sm:text-5xl text-white">
              Let{`'`}s Talk
            </div>
            <CTAButton pricing={true} />
          </div>

          <div className="sm:col-span-4 w-full">
            <table className="table-auto w-full text-white">
              <thead>
                <tr className="hidden sm:table-row">
                  <th>
                    <div className="h-fit rounded-2xl border-[0.5px] border-gray-700 p-4 flex flex-col gap-y-2">
                      <p className="text-lg sm:text-2xl text-bold text-gray-400">
                        Particle
                      </p>
                      <div className="text-[5vw] sm:text-5xl text-white">
                        Fixed{" "}
                        <span className="text-md sm:text-2xl text-bold text-gray-400">
                          /one time
                        </span>
                      </div>
                      <CTAButton pricing={true} />
                    </div>
                  </th>
                  <th>
                    <div className="h-fit rounded-2xl border-[0.5px] border-gray-700 p-4 flex flex-col gap-y-2">
                      <p className="text-lg sm:text-2xl text-bold text-gray-400">
                        Atom
                      </p>
                      <div className="text-[5vw] sm:text-5xl text-white">
                        $1,250{" "}
                        <span className="text-md sm:text-2xl text-bold text-gray-400">
                          /2-week sprint
                        </span>
                      </div>
                      <CTAButton pricing={true} />
                    </div>
                  </th>
                  <th>
                    <div className="h-fit rounded-2xl border-[0.5px] border-gray-700 p-4 flex flex-col gap-y-2">
                      <p className="text-lg sm:text-2xl text-bold text-gray-400">
                        Molecule
                      </p>
                      <div className="text-[5vw] sm:text-5xl text-white">
                        $2,400{" "}
                        <span className="text-md sm:text-2xl text-bold text-gray-400">
                          /2-week sprint
                        </span>
                      </div>
                      <CTAButton pricing={true} />
                    </div>
                  </th>
                  <th>
                    <div className="h-fit rounded-2xl border-[0.5px] border-gray-700 p-4 flex flex-col gap-y-2">
                      <p className="text-lg sm:text-2xl text-bold text-gray-400">
                        Compound
                      </p>
                      <div className="text-[5vw] sm:text-5xl text-white">
                        Let{`'`}s Talk
                      </div>
                      <CTAButton pricing={true} />
                    </div>
                  </th>
                </tr>
                <tr className="table-row sm:hidden">
                  <th>Particle</th>
                  <th>A</th>
                  <th>M</th>
                  <th>C</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, index) => (
                  <tr key={index}>
                    <td className="flex flex-row gap-x-1 items-center justify-between py-2">
                      <p className="text-wrap">{item.feature}</p>
                      <p>
                        {item.isAvailable?.particle ? (
                          <Check
                            className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full p-2 float-end"
                            size={32}
                          />
                        ) : item.sprints ? (
                          <span>{item.sprints.particle}</span>
                        ) : (
                          <X
                            className="bg-gray-700 rounded-full p-2 float-end"
                            size={32}
                          />
                        )}
                      </p>
                    </td>
                    <td className="text-right">
                      {item.isAvailable?.atom ? (
                        <IconCell />
                      ) : item.sprints ? (
                        <span>{item.sprints.atom}</span>
                      ) : (
                        <IconCellDisabled />
                      )}
                    </td>
                    <td className="text-right">
                      {item.isAvailable?.molecule ? (
                        <IconCell />
                      ) : item.sprints ? (
                        <span>{item.sprints.molecule}</span>
                      ) : (
                        <IconCellDisabled />
                      )}
                    </td>
                    <td className="text-right">
                      {item.isAvailable?.compound ? (
                        <IconCell />
                      ) : item.sprints ? (
                        <span>{item.sprints.compound}</span>
                      ) : (
                        <IconCellDisabled />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
