import { PageHeader } from "@/components/PageHeader";

export default function SearchPage() {
  return (
    <div>
      <PageHeader title="Tìm kiếm" description="Tìm lớp, phòng, CLB, chủ đề diễn đàn." />
      <form className="max-w-lg">
        <label className="text-sm">
          Từ khóa
          <input
            name="q"
            className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <button className="mt-3 rounded-full bg-[var(--pine)] px-4 py-2 text-white">Tìm</button>
      </form>
    </div>
  );
}
