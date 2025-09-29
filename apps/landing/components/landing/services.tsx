import { LeftHexa, RightHexa } from "@/components/shared/side-hexas";
import { Righteous } from "next/font/google";
import { CardSparkles } from "@/components/shared/card-sparkles";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export default function Services() {
  const services = [
    {
      id: 1,
      title: "From simple websites to complex web products 10x faster",
      subTitle: "Using vibrant gradients colors, 3d, dynamic typography",
      img: "/imgs/web-skeleton.svg",
    },
    {
      id: 2,
      title: "Data from source to destination all the way",
      subTitle:
        "From cleansing to transformation and loading or vice versa, get the best out of you data",
      img: "/imgs/datapipe.svg",
    },
    {
      id: 3,
      title: "UX/UI-ing sketches to design prototypes",
      subTitle: "We are figma-ians, powered by image gen AI",
      img: "/imgs/design-skeleton.svg",
    },
    {
      id: 4,
      title: "Streamlined deployments ",
      subTitle:
        "From our devices to the world, choose from paas, cloud or self hosting",
      img: "/imgs/web-skeleton.svg",
    },
  ];
  return (
    <div
      id="services"
      className="overflow-x-hidden relative flex flex-col items-center justify-between bg-darkest bg-radial-[at_top_right] from-indigo-600 via-transparent to-transparent"
    >
      <LeftHexa className="absolute left-0 top-10" />
      <RightHexa className="absolute right-0 bottom-10" />
      <div className="lg:max-w-[85rem] h-fit w-full relative overflow-hidden rounded-3xl px-4 py-20">
        <span className="anim whitespace-nowrap rounded-3xl bg-black px-2.5 py-1.5 text-sm text-gray-50 border-gray-50 border">
          Our Services
        </span>
        <div
          className={`anim flex flex-col justify-end bg-conic-[at_top_right] from-transparent via-indigo-100 to-white text-transparent bg-clip-text text-[20px] sm:text-[40px] sm:w-3/5 leading-tight my-4 + ${righteous.className}`}
        >
          <div>
            We create constantly evolving products that are game changing
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {services &&
            services.map((s) => {
              return (
                <div key={s.id}>
                  <CardSparkles
                    title={s.title}
                    subTitle={s.subTitle}
                    img={s.img}
                    id={"particles" + s.id}
                  />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
