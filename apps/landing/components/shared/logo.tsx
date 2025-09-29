import Lottie from "react-lottie-player";
import lottieJson from "../../public/imgs/WebculesLogo.json";

export default function Logo() {
  return (
    <Lottie
      loop
      animationData={lottieJson}
      play
      style={{ width: 150, height: 60 }}
    />
  );
}
