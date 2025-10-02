export const CTAButton = () => {
  return (
    <button className="p-[3px] relative hover:scale-x-105">
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
      <div className="px-4 py-2 text-sm rounded-full relative group transition duration-200 bg-transparent text-white">
        Get all-access -{">"}
      </div>
    </button>
  );
};
