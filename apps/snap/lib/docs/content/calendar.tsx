/* Calendar & availability — the month grid (bookings, committed shoot days,
 * dated open leads), the availability tab (weekly hours, booking settings,
 * blackout dates), and the session-types pointer. Authored from the
 * WEB-272/286 calendar code. */
import { H2, Note, Related, Shot } from "@/lib/docs/primitives";

export default function Calendar() {
  return (
    <>
      <p>
        The Calendar page is your whole studio's month at a glance: client bookings, committed
        shoot days, and the dates your open leads are hoping for. Its second tab,
        Availability, holds the rules that decide what clients can book while you sleep.
      </p>

      <Shot
        src="/docs-shots/calendar/month.png"
        alt="The Snap calendar: a month grid with booking pills, committed shoot days, and dashed tentative leads, with a day panel showing one booking's details."
        grad="sea"
        wide
      />

      <H2>The month grid</H2>
      <p>
        Move between months with the arrows — the month is kept in the URL, so you can bookmark a
        packed season. Times show in your studio's timezone, and the view refetches itself on
        navigation and whenever the tab regains focus: a client who books from your{" "}
        <a href="/docs/booking-page">booking page</a> while you have Snap open appears without a
        manual refresh. Each day cell shows up to two pills with a "+N more" overflow; canceled
        bookings collapse into a struck-through count rather than cluttering the day. Click a day
        and the panel beside the grid shows everything on it.
      </p>

      <H2>Three kinds of entries</H2>
      <table>
        <thead>
          <tr>
            <th>Pill</th>
            <th>What it is</th>
            <th>Clicking through</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Booking</strong> — highlighted pill with the time and client name
            </td>
            <td>A slot a client booked through your booking page or embed.</td>
            <td>
              The day panel shows the client, the payment state (<strong>unpaid</strong>,{" "}
              <strong>deposit</strong>, <strong>paid</strong>), any "moved from" note, and the
              actions: reschedule, cancel, and the client's manage link. See{" "}
              <a href="/docs/bookings">Managing bookings</a>.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Committed shoot day</strong> — green pill with a camera
            </td>
            <td>
              A project in <strong>Booked</strong> or <strong>Snapping</strong> with an event date
              this month. Converted leads land here, so the calendar reflects everything the studio
              actually holds.
            </td>
            <td>
              A "Booked — shoot day" or "Snapping — shoot day" card that opens the{" "}
              <a href="/docs/projects">project</a>.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Dated open lead</strong> — dashed, tentative pill
            </td>
            <td>
              A <a href="/docs/leads">lead</a> still in <strong>new</strong> or{" "}
              <strong>replied</strong> that carries an event date. Nothing is held yet.
            </td>
            <td>
              A "Tentative — lead" card that opens the lead record — convert to turn the dashed
              pill into a committed day, or open the conversation in the inbox to reply.
            </td>
          </tr>
        </tbody>
      </table>
      <Note>
        The date a lead mentions is a wish, not a hold — nothing blocks other clients from booking
        that day until the lead converts into a booking or project.
      </Note>

      <H2>Availability</H2>
      <p>
        The <strong>Availability</strong> tab above the grid is where the rules live.{" "}
        <strong>Weekly hours</strong> are set per weekday — morning and evening windows on the same
        day are fine, and a day with no windows is simply unavailable. Alongside them,{" "}
        <strong>booking settings</strong> shape every slot: slot length (60 minutes by default),
        buffer between bookings, lead time (24 hours by default — bookable from tomorrow), and how
        far ahead the calendar opens (180 days by default).
      </p>
      <p>
        Clients never see these rules — they see the result. Their booking calendar is the same
        engine, so a blacked-out day or a booked slot just shows as unavailable.
      </p>

      <H2>Blackout dates</H2>
      <p>
        Below the booking settings, blackout dates take whole days off the table — holidays,
        shoots you've blocked for yourself, days off. No slots are offered on a blackout date
        regardless of your weekly hours. Add a date and remove it later with one click on its chip.
      </p>

      <H2>Session types live in Templates</H2>
      <p>
        The Availability tab keeps a pointer to them: <strong>Session types live under Templates
        now</strong> — duration, price, deposit, and booking questions are managed in{" "}
        <a href="/dashboard/templates/session-types">Templates → Session types</a>, and Calendar
        keeps your availability. Each type can override the studio defaults — its own slot length,
        buffer, lead time, and horizon, its own hours or the shared ones, and its own deposit — so
        a 45-minute mini session and a full-day wedding book differently on the same page. Free
        includes one session type, Lite three, Studio and above unlimited.
      </p>

      <Related slugs={["booking-page", "bookings", "leads", "templates"]} />
    </>
  );
}
