import CubeLoader from "@/components/ui/cube-loader";

export default function GameLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm">
      <CubeLoader />
    </div>
  );
}
