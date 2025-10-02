import Terms from "./terms.mdx";
export default function TermsPage() {
  return (
    <div className="overflow-x-hidden relative flex flex-col items-center justify-between">
      <div className="prose lg:max-w-[85rem] h-fit lg:px-16 w-full flex flex-col px-4 py-20 mt-20 text-white">
        <Terms />
      </div>
    </div>
  );
}
