// Services view — Phase 5: transport routes & passengers, inventory ledger
// (انبار), guest register and the event calendar. One screen, four tabs.

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bus, Loader2, Plus, Package, UserCheck, CalendarDays, Search, ArrowDownUp, PackageX } from "lucide-react";
import { useMe, useOrgContext, useStudents, useTransportRoutes, useCreateTransportRoute, useUpdateTransportRoute, useTransportPassengers, useAddTransportPassenger, useUpdateTransportPassenger, useInventoryItems, useCreateInventoryItem, useInventoryMovements, useRecordInventoryMovement, useGuestVisits, useCreateGuestVisit, useCheckoutGuest, useSchoolEvents, useCreateSchoolEvent } from "@/lib/api/hooks";
import { EmptyState, NoResultsState, TableSkeleton, Ltr, KpiCard, JalaliDateInput } from "@/components/shared";
import { faNum, faMoneyNum, faDate, formatInstantJalaliDateTime } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { apiErrorMessage } from "@/lib/api/hooks";
import { FinBadge, FinHeader } from "@/features/finance/shared";

const EVENT_KINDS = [
  { value: "meeting", label: "جلسه" },
  { value: "exam", label: "امتحان" },
  { value: "holiday", label: "رخصتی" },
  { value: "ceremony", label: "مراسم" },
  { value: "other", label: "دیگر" },
];

export function ServicesView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "services.manage");
  const [tab, setTab] = useState("transport");

  return (
    <div className="space-y-4">
      <FinHeader
        title="خدمات مکتب"
        subtitle="ترانسپورت، انبار، ثبت مهمان‌ها و تقویم رویدادها — همه محدود به شعبهٔ فعال شما."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="transport">ترانسپورت</TabsTrigger>
          <TabsTrigger value="inventory">انبار</TabsTrigger>
          <TabsTrigger value="guests">مهمان‌ها</TabsTrigger>
          <TabsTrigger value="events">رویدادها</TabsTrigger>
        </TabsList>
        <TabsContent value="transport" className="mt-3">
          <TransportTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="inventory" className="mt-3">
          <InventoryTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="guests" className="mt-3">
          <GuestsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="events" className="mt-3">
          <EventsTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Transport tab ───────────────────────────────────────────────────────────

function TransportTab({ canManage }: { canManage: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [addPassengerRouteId, setAddPassengerRouteId] = useState<string | null>(null);
  const { data: routes, isLoading } = useTransportRoutes();
  const activeRoutes = (routes ?? []).filter((r) => r.isActive);
  const totalSeats = activeRoutes.reduce((s, r) => s + r.capacity, 0);
  const totalPassengers = activeRoutes.reduce((s, r) => s + r.activePassengers, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="مسیرهای فعال" value={faNum(activeRoutes.length)} icon={Bus} />
        <KpiCard label="ظرفیت مجموع" value={faNum(totalSeats)} icon={Bus} tone="primary" />
        <KpiCard label="مسافران فعال" value={faNum(totalPassengers)} icon={UserCheck} tone="amber" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">مسیرهای ترانسپورت</span>
            {canManage ? (
              <div className="ms-auto">
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> مسیر جدید
                </Button>
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={4} cols={6} /></div>
          ) : (routes ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Bus} title="مسیری ثبت نشده است" body={canManage ? "اولین مسیر ترانسپورت شعبه را ثبت کنید." : undefined} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام مسیر</TableHead>
                    <TableHead>راننده</TableHead>
                    <TableHead>وسیله</TableHead>
                    <TableHead>مسافران / ظرفیت</TableHead>
                    <TableHead>فیس ماهانه</TableHead>
                    <TableHead>وضعیت</TableHead>
                    {canManage ? <TableHead className="w-32">عملیات</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(routes ?? []).map((r) => (
                    <TableRow key={r.id} className={r.isActive ? "" : "opacity-60"}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.driverName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.vehicle ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {faNum(r.activePassengers)} / {faNum(r.capacity)}
                      </TableCell>
                      <TableCell className="tabular-nums">{r.monthlyFeeDiram > 0 ? faMoneyNum(r.monthlyFeeDiram) : "—"}</TableCell>
                      <TableCell>
                        <FinBadge status={r.isActive ? "active" : "inactive"} label={r.isActive ? "فعال" : "غیرفعال"} />
                      </TableCell>
                      {canManage ? (
                        <TableCell className="space-x-1 space-x-reverse">
                          {r.isActive ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setAddPassengerRouteId(r.id)}>
                                <Plus className="h-3.5 w-3.5" /> مسافر
                              </Button>
                              <DeactivateRouteButton id={r.id} />
                            </>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PassengersTable />

      {createOpen ? <CreateRouteDialog open onOpenChange={setCreateOpen} /> : null}
      {addPassengerRouteId ? (
        <AddPassengerDialog routeId={addPassengerRouteId} onClose={() => setAddPassengerRouteId(null)} />
      ) : null}
    </div>
  );
}

function DeactivateRouteButton({ id }: { id: string }) {
  const update = useUpdateTransportRoute();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={update.isPending}
      onClick={async () => {
        try {
          await update.mutateAsync({ id, isActive: false });
          toast.success("مسیر غیرفعال شد.");
        } catch (err) {
          toast.error(apiErrorMessage(err));
        }
      }}
    >
      توقف
    </Button>
  );
}

function PassengersTable() {
  const [routeId, setRouteId] = useState("");
  const update = useUpdateTransportPassenger();
  const { data: routes } = useTransportRoutes();
  const { data: passengers, isLoading } = useTransportPassengers({
    routeId: routeId || undefined,
    status: "active",
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">مسافران فعال</span>
          <Select value={routeId || "all"} onValueChange={(v) => setRouteId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه مسیرها</SelectItem>
              {(routes ?? []).filter((r) => r.isActive).map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={4} cols={5} /></div>
        ) : (passengers ?? []).length === 0 ? (
          <div className="p-6"><EmptyState icon={UserCheck} title="مسافری ثبت نشده است" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شاگرد</TableHead>
                  <TableHead>مسیر</TableHead>
                  <TableHead>ایستگاه</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(passengers ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="font-medium">{p.studentName}</span>{" "}
                      <span className="text-xs text-muted-foreground">({p.studentNumber})</span>
                    </TableCell>
                    <TableCell>{p.routeName}</TableCell>
                    <TableCell className="text-muted-foreground">{p.stopName ?? "—"}</TableCell>
                    <TableCell>
                      <FinBadge status={p.status === "active" ? "active" : "inactive"} label={p.statusLabel} />
                    </TableCell>
                    <TableCell>
                      {p.status === "active" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={update.isPending}
                          onClick={async () => {
                            try {
                              await update.mutateAsync({ id: p.id, status: "stopped" });
                              toast.success("مسافر توقف داده شد.");
                            } catch (err) {
                              toast.error(apiErrorMessage(err));
                            }
                          }}
                        >
                          توقف
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateRouteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateTransportRoute();
  const [name, setName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [feeAfn, setFeeAfn] = useState("");
  const [stops, setStops] = useState("");
  const [note, setNote] = useState("");

  const cap = Number(capacity.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  const feeDiram = feeAfn.trim()
    ? Math.round(Number(feeAfn.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[,٬،\s]/g, "")) * 100)
    : 0;
  const valid = name.trim().length >= 3 && Number.isInteger(cap) && cap >= 1 && cap <= 80;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مسیر ترانسپورت جدید</DialogTitle>
          <DialogDescription>مسیر در شعبهٔ فعال شما ثبت می‌شود.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نام مسیر</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: مسیر اول — چهارراهی پرچم" />
            </div>
            <div className="space-y-1.5">
              <Label>راننده (اختیاری)</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>ظرفیت</Label>
              <Input dir="ltr" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>فیس ماهانه (افغانی)</Label>
              <Input dir="ltr" inputMode="decimal" value={feeAfn} onChange={(e) => setFeeAfn(e.target.value)} placeholder="مثلاً 600" />
            </div>
            <div className="space-y-1.5">
              <Label>وسیله (اختیاری)</Label>
              <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>ایستگاه‌ها (اختیاری — با کاما)</Label>
            <Input value={stops} onChange={(e) => setStops(e.target.value)} placeholder="مثلاً: پرچم، شahrنو، کارتِ نو" />
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  name: name.trim(),
                  driverName: driverName.trim() || null,
                  vehicle: vehicle.trim() || null,
                  capacity: cap,
                  monthlyFeeDiram: Number.isFinite(feeDiram) && feeDiram >= 0 ? feeDiram : 0,
                  stops: stops.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
                  note: note.trim() || null,
                });
                toast.success("مسیر ثبت شد.");
                onOpenChange(false);
                setName(""); setDriverName(""); setVehicle(""); setFeeAfn(""); setStops(""); setNote("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPassengerDialog({ routeId, onClose }: { routeId: string; onClose: () => void }) {
  const add = useAddTransportPassenger();
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState("");
  const [stopName, setStopName] = useState("");
  const { data: students } = useStudents({ q: q || undefined, pageSize: 10 });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن مسافر به مسیر</DialogTitle>
          <DialogDescription>
            ظرفیت مسیر در همان تراکنش بررسی می‌شود؛ شاگرد باید در شعبهٔ همین مسیر شمولیت فعال داشته باشد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>شاگرد</Label>
            <div className="relative">
              <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی شاگرد…" className="ps-8" />
            </div>
            <Select value={studentId || "none"} onValueChange={(v) => setStudentId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="یک شاگرد انتخاب کنید" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— انتخاب شاگرد —</SelectItem>
                {(students?.items ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.personal.firstName ?? "—"} {s.personal.fatherName ?? ""} ({s.studentNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ایستگاه (اختیاری)</Label>
            <Input value={stopName} onChange={(e) => setStopName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>لغو</Button>
          <Button
            disabled={!studentId || add.isPending}
            onClick={async () => {
              try {
                await add.mutateAsync({ routeId, studentId, stopName: stopName.trim() || null });
                toast.success("مسافر ثبت شد.");
                onClose();
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "افزودن"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inventory tab ───────────────────────────────────────────────────────────

function InventoryTab({ canManage }: { canManage: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [moveItemId, setMoveItemId] = useState<string | null>(null);
  const { data: items, isLoading } = useInventoryItems();
  const lowCount = (items ?? []).filter((i) => i.isLow).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="اقلام انبار" value={faNum((items ?? []).length)} icon={Package} />
        <KpiCard label="اقلام کم‌موجود" value={faNum(lowCount)} icon={PackageX} tone={lowCount > 0 ? "amber" : "primary"} />
        <KpiCard
          label="مجموع موجودی"
          value={faNum((items ?? []).reduce((s, i) => s + i.quantity, 0))}
          icon={Package}
          tone="primary"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">اقلام انبار (شعبهٔ فعال)</span>
            {canManage ? (
              <div className="ms-auto flex gap-2">
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> قلم جدید
                </Button>
              </div>
            ) : null}
          </div>
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={5} cols={5} /></div>
          ) : (items ?? []).length === 0 ? (
            <div className="p-6"><EmptyState icon={Package} title="قلمی ثبت نشده است" body={canManage ? "اولین قلم انبار را ثبت کنید." : undefined} /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام قلم</TableHead>
                    <TableHead>واحد</TableHead>
                    <TableHead>موجودی</TableHead>
                    <TableHead>حداقل</TableHead>
                    <TableHead>وضعیت</TableHead>
                    {canManage ? <TableHead className="w-40">عملیات</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(items ?? []).map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-muted-foreground">{i.unit}</TableCell>
                      <TableCell className={`tabular-nums font-semibold ${i.isLow ? "text-amber-700" : ""}`}>{faNum(i.quantity)}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{faNum(i.minQuantity)}</TableCell>
                      <TableCell>
                        <FinBadge status={i.isLow ? "issued" : "active"} label={i.isLow ? "کم‌موجود" : "نرمال"} />
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setMoveItemId(i.id)}>
                            <ArrowDownUp className="h-3.5 w-3.5" /> ورود/صرف
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen ? <CreateItemDialog open onOpenChange={setCreateOpen} /> : null}
      {moveItemId ? <MovementDialog itemId={moveItemId} onClose={() => setMoveItemId(null)} /> : null}
    </div>
  );
}

function CreateItemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateInventoryItem();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("عدد");
  const [minQuantity, setMinQuantity] = useState("0");
  const [note, setNote] = useState("");
  const min = Number(minQuantity.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>قلم انبار جدید</DialogTitle>
          <DialogDescription>قلم با موجودی صفر ثبت می‌شود؛ موجودی با «ورود» در همان تراکنش افزوده می‌شود.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>نام قلم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: تخته‌سپیده" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>واحد</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["عدد", "بسته", "لیتر", "کیلو", "متر"].map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>حداقل موجودی</Label>
              <Input dir="ltr" inputMode="numeric" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={name.trim().length < 2 || create.isPending || !Number.isFinite(min) || min < 0}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  name: name.trim(),
                  unit,
                  minQuantity: Number.isFinite(min) ? min : 0,
                  note: note.trim() || null,
                });
                toast.success("قلم ثبت شد.");
                onOpenChange(false);
                setName(""); setNote("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const record = useRecordInventoryMovement();
  const { data: movements } = useInventoryMovements(itemId);
  const { data: items } = useInventoryItems();
  const item = (items ?? []).find((i) => i.id === itemId);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const n = Number(delta.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[,٬،\s]/g, ""));
  const isReceive = Number.isFinite(n) && n > 0;
  const isIssue = Number.isFinite(n) && n < 0;
  const valid = (isReceive || isIssue) && reason.trim().length >= 3;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>ورود / صرف موجودی — {item?.name ?? "…"}</DialogTitle>
          <DialogDescription>
            مقدار مثبت = ورود به انبار، منفی = صرف. موجودی منفی در همان تراکنش رد می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>مقدار (مثبت/منفی)</Label>
              <Input dir="ltr" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="مثلاً 50 یا -20" />
            </div>
            <div className="space-y-1.5">
              <Label>موجودی فعلی</Label>
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm tabular-nums">
                {item ? `${faNum(item.quantity)} ${item.unit}` : "—"}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>دلیل</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: خرید از بازار / توزیع به صنف پنجم" />
          </div>
          {(movements ?? []).length > 0 ? (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {(movements ?? []).slice(0, 10).map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span className={m.delta > 0 ? "text-emerald-700" : "text-red-700"}>
                    {m.delta > 0 ? "+" : ""}{faNum(m.delta)} — {m.reason}
                  </span>
                  <span className="text-muted-foreground">{formatInstantJalaliDateTime(m.at)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>بستن</Button>
          <Button
            disabled={!valid || record.isPending}
            onClick={async () => {
              try {
                await record.mutateAsync({ itemId, delta: n, reason: reason.trim() });
                toast.success("حرکت موجودی ثبت شد.");
                setDelta(""); setReason("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت حرکت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Guests tab ──────────────────────────────────────────────────────────────

function GuestsTab({ canManage }: { canManage: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [inside, setInside] = useState("true");
  const checkout = useCheckoutGuest();
  const { data: guests, isLoading } = useGuestVisits({ inside: inside || undefined });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">ثبت مهمان‌ها</span>
            <Select value={inside} onValueChange={setInside}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">داخل مکتب</SelectItem>
                <SelectItem value="false">خارج‌شده</SelectItem>
                <SelectItem value="">همه</SelectItem>
              </SelectContent>
            </Select>
            {canManage ? (
              <div className="ms-auto">
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> ورود مهمان
                </Button>
              </div>
            ) : null}
          </div>
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={4} cols={5} /></div>
          ) : (guests ?? []).length === 0 ? (
            <div className="p-6"><EmptyState icon={UserCheck} title="مهمانی ثبت نشده است" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام مهمان</TableHead>
                    <TableHead>هدف</TableHead>
                    <TableHead>میزبان</TableHead>
                    <TableHead>تعداد</TableHead>
                    <TableHead>زمان ورود</TableHead>
                    <TableHead>زمان خروج</TableHead>
                    {canManage ? <TableHead className="w-24">عملیات</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(guests ?? []).map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{g.purpose}</TableCell>
                      <TableCell className="text-muted-foreground">{g.hostName ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{faNum(g.visitorCount)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatInstantJalaliDateTime(g.arrivedAt)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {g.leftAt ? formatInstantJalaliDateTime(g.leftAt) : <FinBadge status="active" label="داخل مکتب" />}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          {g.isInside ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={checkout.isPending}
                              onClick={async () => {
                                try {
                                  await checkout.mutateAsync({ id: g.id });
                                  toast.success("خروج ثبت شد.");
                                } catch (err) {
                                  toast.error(apiErrorMessage(err));
                                }
                              }}
                            >
                              ثبت خروج
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen ? <CreateGuestDialog open onOpenChange={setCreateOpen} /> : null}
    </div>
  );
}

function CreateGuestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateGuestVisit();
  const [fullName, setFullName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [hostName, setHostName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [visitorCount, setVisitorCount] = useState("1");
  const [note, setNote] = useState("");
  const count = Number(visitorCount.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  const valid = fullName.trim().length >= 3 && purpose.trim().length >= 3 && Number.isInteger(count) && count >= 1 && count <= 20;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>ثبت ورود مهمان</DialogTitle>
          <DialogDescription>زمان ورود به‌صورت خودکار ثبت می‌شود.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نام مهمان</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>تعداد افراد</Label>
              <Input dir="ltr" inputMode="numeric" value={visitorCount} onChange={(e) => setVisitorCount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>هدف از آمدن</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="مثلاً: ملاقات مدیر" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>میزبان (اختیاری)</Label>
              <Input value={hostName} onChange={(e) => setHostName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>شمارهٔ تذکره (اختیاری)</Label>
              <Input dir="ltr" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  fullName: fullName.trim(),
                  purpose: purpose.trim(),
                  hostName: hostName.trim() || null,
                  idNumber: idNumber.trim() || null,
                  visitorCount: count,
                  note: note.trim() || null,
                });
                toast.success("ورود مهمان ثبت شد.");
                onOpenChange(false);
                setFullName(""); setPurpose(""); setHostName(""); setIdNumber(""); setNote("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Events tab ──────────────────────────────────────────────────────────────

function EventsTab({ canManage }: { canManage: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: events, isLoading } = useSchoolEvents();

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">تقویم رویدادها</span>
            <span className="text-xs text-muted-foreground">
              رویدادهای «همه شعبه‌ها» برای هر شعبه‌ای قابل‌مشاهده‌اند.
            </span>
            {canManage ? (
              <div className="ms-auto">
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> رویداد جدید
                </Button>
              </div>
            ) : null}
          </div>
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={4} cols={5} /></div>
          ) : (events ?? []).length === 0 ? (
            <div className="p-6"><EmptyState icon={CalendarDays} title="رویدادی ثبت نشده است" body={canManage ? "اولین رویداد را ثبت کنید." : undefined} /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>شروع</TableHead>
                    <TableHead>ختم</TableHead>
                    <TableHead>حیطه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(events ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.title}</TableCell>
                      <TableCell><FinBadge status="approved" label={e.kindLabel} /></TableCell>
                      <TableCell className="text-muted-foreground">{faDate(e.startsOn)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.endsOn ? faDate(e.endsOn) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.branchId ? "این شعبه" : "همه شعبه‌ها"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {createOpen ? <CreateEventDialog open onOpenChange={setCreateOpen} /> : null}
    </div>
  );
}

function CreateEventDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateSchoolEvent();
  const { data: me } = useMe();
  const { data: orgCtx } = useOrgContext();
  const isCrossBranch =
    hasGrant(me, "services.manage") &&
    (me?.roles ?? []).some((r) => r === "admin" || r === "general_manager");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("meeting");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [scope, setScope] = useState("own");
  const [note, setNote] = useState("");

  const valid = title.trim().length >= 3 && startsOn.length >= 8;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>رویداد جدید</DialogTitle>
          <DialogDescription>
            رویداد در تقویم شعبه ثبت می‌شود؛ مدیر سیستم و مدیر عام می‌توانند رویداد «همه شعبه‌ها» ثبت کنند.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: امتحانات میان‌ترم" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isCrossBranch && (orgCtx?.branches ?? []).length > 1 ? (
              <div className="space-y-1.5">
                <Label>حیطه</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own">شعبهٔ فعال</SelectItem>
                    <SelectItem value="org">همه شعبه‌ها</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>تاریخ شروع</Label>
              <JalaliDateInput value={startsOn} onChange={setStartsOn} placeholder="۱۴۰۵/۰۹/۱۰" />
            </div>
            <div className="space-y-1.5">
              <Label>تاریخ ختم (اختیاری)</Label>
              <JalaliDateInput value={endsOn} onChange={setEndsOn} placeholder="۱۴۰۵/۰۹/۲۰" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  title: title.trim(),
                  kind,
                  startsOn,
                  endsOn: endsOn || null,
                  // "own" → the viewer's ACTIVE branch context; "org" → null
                  // (an org-wide event visible to every branch).
                  branchId: scope === "org" ? null : (me?.branchId ?? undefined),
                  note: note.trim() || null,
                });
                toast.success("رویداد ثبت شد.");
                onOpenChange(false);
                setTitle(""); setStartsOn(""); setEndsOn(""); setNote("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
